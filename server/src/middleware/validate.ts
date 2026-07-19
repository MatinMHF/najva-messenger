import { AnyZodObject } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export const validate = (schema: AnyZodObject) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    return next();
  } catch (error: any) {
    return res.status(400).json({ status: 'error', message: 'Validation failed', errors: error.errors });
  }
};
