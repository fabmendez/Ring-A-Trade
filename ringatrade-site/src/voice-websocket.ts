import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { logger } from "./lib/logger.js";

const GEMINI_HOST = "generativelanguage.googleapis.com";
const MODEL = "models/gemini-2.0-flash-exp"; // or gemini-2.0-flash

const systemInstruction = `
You are the Ringatrade voice assistant.
Your job is to help customers describe a trade job and collect enough information to match them with a suitable tradesperson.

Be friendly, concise, and practical.
Ask one question at a time.
Do not over-explain.
Do not promise a fixed price.
Do not guarantee availability.

Collect the following details:
1. Trade needed
2. Job description
3. Postcode
4. Urgency
5. Customer name
6. Phone number
7. Email (optional)
8. Preferred contact method

Confirm details before submission.
Once confirmed, you MUST call the "submit_lead" function to submit the job.
`;

const tools = [
  {
    functionDeclarations: [
      {
        name: "submit_lead",
        description: "Submit the lead details to the system when all required information is gathered and confirmed by the user.",
        parameters: {
          type: "OBJECT",
          properties: {
            trade: { type: "STRING" },
            job_description: { type: "STRING" },
            postcode: { type: "STRING" },
            urgency: { type: "STRING" },
            customer_name: { type: "STRING" },
            phone: { type: "STRING" },
            email: { type: "STRING" },
            preferred_contact_method: { type: "STRING" },
            summary: { type: "STRING", description: "A brief summary of the job" }
          },
          required: ["trade", "job_description", "postcode", "urgency", "customer_name", "phone", "preferred_contact_method", "summary"]
        }
      }
    ]
  }
];

export function setupVoiceWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (request.url === "/ws/voice") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (clientWs) => {
    logger.info("New client connected to voice WS");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      clientWs.send(JSON.stringify({ type: "error", message: "GEMINI_API_KEY is not configured" }));
      clientWs.close();
      return;
    }

    const url = `wss://${GEMINI_HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const geminiWs = new WebSocket(url);

    let setupCompleted = false;

    geminiWs.on("open", () => {
      logger.info("Connected to Gemini Live API");
      
      // Send setup message
      const setupMessage = {
        setup: {
          model: MODEL,
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          tools: tools,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Aoede" // Choose a nice voice
                }
              }
            }
          }
        }
      };
      geminiWs.send(JSON.stringify(setupMessage));
    });

    geminiWs.on("message", async (data) => {
      const response = JSON.parse(data.toString());
      
      if (response.serverContent?.modelTurn) {
        const parts = response.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            // Forward audio to client
            clientWs.send(JSON.stringify({
              type: "audio",
              data: part.inlineData.data // base64 pcm 16000
            }));
          }
        }
      }

      // Handle function calls
      if (response.toolCall) {
        const call = response.toolCall.functionCalls[0];
        if (call.name === "submit_lead") {
          logger.info({ args: call.args }, "Gemini invoked submit_lead");
          
          // Submit the lead to the webhook
          const webhookUrl = process.env.VITE_N8N_VOICE_INTAKE_WEBHOOK;
          if (webhookUrl) {
            try {
              const payload = {
                source: "voice_intake",
                ...call.args,
                transcript: "Voice transcript via Gemini",
                confidence: 1.0
              };
              await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });
              logger.info("Lead sent to n8n webhook");
            } catch (err) {
              logger.error({ err }, "Error sending lead to webhook");
            }
          }

          // Reply to Gemini with function response
          geminiWs.send(JSON.stringify({
            toolResponse: {
              functionResponses: [{
                id: call.id,
                name: call.name,
                response: { result: "Success, the lead has been submitted to the database." }
              }]
            }
          }));

          // Notify frontend
          clientWs.send(JSON.stringify({ type: "submitted" }));
        }
      }

      if (response.setupComplete) {
        setupCompleted = true;
        clientWs.send(JSON.stringify({ type: "ready" }));
      }
    });

    geminiWs.on("close", () => {
      logger.info("Gemini WS closed");
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });

    geminiWs.on("error", (err) => {
      logger.error({ err }, "Gemini WS error");
    });

    // Handle messages from the browser
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === "audio") {
        if (!setupCompleted || geminiWs.readyState !== WebSocket.OPEN) return;
        
        // Forward client audio to Gemini as realtimeInput
        geminiWs.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              mimeType: "audio/pcm;rate=16000",
              data: msg.data
            }]
          }
        }));
      }
    });

    clientWs.on("close", () => {
      logger.info("Client disconnected from voice WS");
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.close();
      }
    });
  });
}
