import { Router } from 'express';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { validate } from '../../middleware/validate.middleware';
import { authRateLimiter } from '../../middleware/rateLimiter.middleware';
import { registerSchema, loginSchema, refreshTokenSchema } from './auth.schema';

const router = Router();

const authRepository = new AuthRepository();
const authService    = new AuthService(authRepository);
const authController = new AuthController(authService);

router.post('/register', authRateLimiter, validate(registerSchema),      authController.register);
router.post('/login',    authRateLimiter, validate(loginSchema),          authController.login);
router.post('/refresh',  authRateLimiter, validate(refreshTokenSchema),   authController.refresh);
router.post('/logout',                   validate(refreshTokenSchema),    authController.logout);

export { router as authRouter };
