import { type Request, type Response, type NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session && (req.session as any).adminLoggedIn) {
    next();
    return;
  }
  res.redirect("/admin/login");
}
