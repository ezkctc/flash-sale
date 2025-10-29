import * as path from 'path';
import { FastifyInstance } from 'fastify';
import AutoLoad from '@fastify/autoload';
import { integrateRoutes } from './routes';

import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
/* eslint-disable-next-line */
export interface AppOptions {}

export async function app(fastify: FastifyInstance, opts: AppOptions) {
  // Place here your custom code!

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: { ...opts },
  });
  // Also load top-level plugins (e.g., mongo, auth)
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, '..', 'plugins'),
    options: { ...opts },
  });

  fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'API',
        description: 'Flash Sale API',
        version: '1.0.0',
      },
      servers: [
        {
          url:
            process.env.NODE_ENV === 'production'
              ? 'https://your-domain.com'
              : 'http://localhost:4000',
          description:
            process.env.NODE_ENV === 'production'
              ? 'Production server'
              : 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'token',
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
        {
          cookieAuth: [],
        },
      ],
    },
  });

  // Register Swagger UI only if Swagger is enabled
  fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header: any) => header,
    transformSpecification: (swaggerObject, request, reply) => {
      return swaggerObject;
    },
    transformSpecificationClone: true,
  });

  // Register routes explicitly to control structure (after swagger)
  integrateRoutes(fastify);

  const selfOrigin = `http://${process.env.BEND_HOST}:${process.env.BEND_PORT}`;

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    selfOrigin,
  ];

  fastify.register(cors, {
    origin: (origin, cb) => {
      // If no origin (like curl or Postman), allow it
      if (!origin) return cb(null, true);

      if (allowedOrigins.includes(origin)) {
        cb(null, true); // ✅ allow
      } else {
        cb(new Error('Not allowed by CORS'), false); // ❌ deny
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  fastify.register(cookie);

  fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'super-secret-key-change-in-production',
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  });

  // Authentication decorator
  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });
}
