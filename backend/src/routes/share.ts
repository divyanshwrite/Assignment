import { Router } from "express";
import { Assignment } from "../models/Assignment.js";
import { ShareToken } from "../models/ShareToken.js";

const router = Router();

router.get("/:token", async (req, res, next) => {
  try {
    const share = await ShareToken.findOne({ token: req.params.token }).lean();
    if (!share) {
      res.status(404).json({ message: "Share link not found or expired." });
      return;
    }
    if (share.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ message: "Share link expired." });
      return;
    }
    const assignment = await Assignment.findById(share.assignment).select("-pdf").lean();
    if (!assignment?.result) {
      res.status(404).json({ message: "Assignment not available." });
      return;
    }

    // Strip teacher-only info: do not leak prompt or raw source content.
    const { prompt: _prompt, sourceContent: _sc, ...safe } = assignment as any;
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({
      ...safe,
      sharedAt: share.createdAt,
      expiresAt: share.expiresAt
    });
  } catch (error) {
    next(error);
  }
});

export default router;
