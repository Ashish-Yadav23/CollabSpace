import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    res.status(409).json({
      error: `Duplicate value for ${field}`,
    });
    return;
  }

  // Handle CORS unauthorized origin errors
  if (err.message && err.message.includes('CORS')) {
    res.status(403).json({
      error: err.message,
    });
    return;
  }

  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal server error',
  });
}
