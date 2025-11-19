import type { User } from "../../shared/database.js";

declare global {
  namespace Express {
    interface Request {
      user: User | null;
    }
  }
}

export {};
