import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import rateLimit from "express-rate-limit";
import path from "node:path";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

const ROOT_DIR = path.join(__dirname, "..");

app.set("views", path.join(ROOT_DIR, "views"));
app.set("view engine", "ejs");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env["SESSION_SECRET"] || "ringatrade-dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env["NODE_ENV"] === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.static(path.join(ROOT_DIR, "public")));

app.use("/", router);

app.use((req, res) => {
  res.status(404).render("404", { title: "Page Not Found | Ringatrade" });
});

export default app;
