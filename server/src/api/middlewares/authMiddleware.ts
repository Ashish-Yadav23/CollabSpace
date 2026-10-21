import { Request, Response, NextFunction } from 'express';
import { verifyToken, UserTokenPayload } from '../../utils/tokens';
import { UserModel } from '../../db/models/User';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        color?: string;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken<UserTokenPayload>(token);

    const user = await UserModel.findById(decoded.userId).select('_id email name color');
    if (!user) {
      res.status(401).json({ error: 'User no longer exists' });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      color: user.color || '#3B82F6',
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken<UserTokenPayload>(token);
    const user = await UserModel.findById(decoded.userId).select('_id email name color');
    if (user) {
      req.user = {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        color: user.color || '#3B82F6',
      };
    }
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next();
}
