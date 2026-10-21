import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserModel } from '../../db/models/User';
import { signUserToken } from '../../utils/tokens';

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters long').max(100),
  name: z.string().trim().min(1, 'Name is required').max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code (e.g. #3B82F6)').optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const DEFAULT_AVATAR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
];

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = registerSchema.parse(req.body);
    const normalizedEmail = validated.email.toLowerCase().trim();

    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({ error: 'Email is already registered' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(validated.password, salt);

    const assignedColor = validated.color || DEFAULT_AVATAR_COLORS[Math.floor(Math.random() * DEFAULT_AVATAR_COLORS.length)];

    const user = await UserModel.create({
      email: normalizedEmail,
      passwordHash,
      name: validated.name,
      color: assignedColor,
    });

    const token = signUserToken({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = loginSchema.parse(req.body);
    const normalizedEmail = validated.email.toLowerCase().trim();

    const user = await UserModel.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isMatch = await bcrypt.compare(validated.password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signUserToken({
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = await UserModel.findById(req.user.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}
