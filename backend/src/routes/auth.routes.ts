import { Router } from "express";
import { getAuthMeHandler } from "../controllers/auth.controller";

const r = Router();

r.get("/auth/me", getAuthMeHandler);

export default r;
