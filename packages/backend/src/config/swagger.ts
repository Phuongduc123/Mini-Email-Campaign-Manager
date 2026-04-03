
export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Mini Campaign Manager API',
    version: '1.0.0',
    description:
      'REST API for creating, managing, and tracking email marketing campaigns.',
  },
  servers: [{ url: '/api/v1', description: 'Development server' }],

  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from /auth/login or /auth/register',
      },
    },
    schemas: {
      // ── Shared ──────────────────────────────────────────────────────
      Error: {
        type: 'object',
        properties: {
          error:      { type: 'string', example: 'CAMPAIGN_NOT_DRAFT' },
          message:    { type: 'string', example: 'Campaign cannot be edited after scheduling.' },
          statusCode: { type: 'integer', example: 409 },
          requestId:  { type: 'string', example: 'req_6b6c2d15118c' },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          total:      { type: 'integer', example: 134 },
          page:       { type: 'integer', example: 1 },
          limit:      { type: 'integer', example: 20 },
          totalPages: { type: 'integer', example: 7 },
        },
      },

      // ── Auth ────────────────────────────────────────────────────────
      AuthResponse: {
        type: 'object',
        properties: {
          accessToken:  { type: 'string', description: 'Short-lived JWT (15 min). Use in Authorization: Bearer header.', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          refreshToken: { type: 'string', description: 'Long-lived token (7 days). Use to obtain a new accessToken via POST /auth/refresh.', example: '550e8400-e29b-41d4-a716-446655440000' },
          user: {
            type: 'object',
            properties: {
              id:    { type: 'integer', example: 1 },
              email: { type: 'string', example: 'user@example.com' },
              name:  { type: 'string', example: 'John Doe' },
            },
          },
        },
      },
      TokenPair: {
        type: 'object',
        properties: {
          accessToken:  { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          refreshToken: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
        },
      },

      // ── Campaign ────────────────────────────────────────────────────
      CampaignStatus: {
        type: 'string',
        enum: ['draft', 'scheduled', 'sending', 'sent'],
      },
      Campaign: {
        type: 'object',
        properties: {
          id:          { type: 'integer', example: 1 },
          name:        { type: 'string', example: 'Spring Newsletter' },
          subject:     { type: 'string', example: 'Big news this spring!' },
          body:        { type: 'string', example: '<h1>Hello</h1>' },
          status:      { $ref: '#/components/schemas/CampaignStatus' },
          scheduledAt: { type: 'string', format: 'date-time', nullable: true },
          createdBy:   { type: 'integer', example: 1 },
          createdAt:   { type: 'string', format: 'date-time' },
          updatedAt:   { type: 'string', format: 'date-time' },
          campaignRecipients: {
            type: 'array',
            description: 'Included on GET /campaigns/:id only',
            items: {
              type: 'object',
              properties: {
                recipientId: { type: 'integer', example: 1 },
                status:      { type: 'string', enum: ['pending', 'sent', 'failed'] },
                sentAt:      { type: 'string', format: 'date-time', nullable: true },
                openedAt:    { type: 'string', format: 'date-time', nullable: true },
                errorMessage:{ type: 'string', nullable: true },
                recipient: {
                  type: 'object',
                  properties: {
                    id:    { type: 'integer', example: 1 },
                    email: { type: 'string', example: 'alice@example.com' },
                    name:  { type: 'string', example: 'Alice' },
                  },
                },
              },
            },
          },
        },
      },
      CampaignStats: {
        type: 'object',
        properties: {
          total:     { type: 'integer', example: 1000 },
          sent:      { type: 'integer', example: 800 },
          failed:    { type: 'integer', example: 200 },
          opened:    { type: 'integer', example: 400 },
          send_rate: { type: 'number', format: 'float', example: 0.8 },
          open_rate: { type: 'number', format: 'float', example: 0.5 },
        },
      },

      // ── Recipient ───────────────────────────────────────────────────
      Recipient: {
        type: 'object',
        properties: {
          id:             { type: 'integer', example: 1 },
          email:          { type: 'string', example: 'recipient@example.com' },
          name:           { type: 'string', example: 'Jane Smith' },
          unsubscribedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt:      { type: 'string', format: 'date-time' },
        },
      },
    },
  },

  security: [{ BearerAuth: [] }],

  paths: {
    // ── Auth ──────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'name', 'password'],
                properties: {
                  email:    { type: 'string', format: 'email', example: 'user@example.com' },
                  name:     { type: 'string', example: 'John Doe' },
                  password: { type: 'string', minLength: 8, example: 'password123' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Registered successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          409: { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        description: 'Exchange a valid refresh token for a new access token + new refresh token (rotation). The old refresh token is immediately revoked.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'New token pair issued',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } },
          },
          401: { description: 'Refresh token is invalid, expired, or already revoked', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout (revoke refresh token)',
        description: 'Revokes the provided refresh token. The access token remains valid until it expires naturally (max 15 min).',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Logged out successfully' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and receive tokens',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email:    { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', example: 'password123' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Campaigns ─────────────────────────────────────────────────────
    '/campaigns': {
      get: {
        tags: ['Campaigns'],
        summary: 'List campaigns (paginated)',
        parameters: [
          { name: 'page',   in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',  in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/CampaignStatus' } },
        ],
        responses: {
          200: {
            description: 'Paginated campaign list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Campaign' } },
                    meta: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Campaigns'],
        summary: 'Create a new campaign',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'subject', 'body', 'recipientIds'],
                properties: {
                  name:         { type: 'string', example: 'Spring Newsletter' },
                  subject:      { type: 'string', example: 'Big news this spring!' },
                  body:         { type: 'string', example: '<h1>Hello!</h1>' },
                  recipientIds: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Campaign created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Campaign' } } } },
          422: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/campaigns/{id}': {
      get: {
        tags: ['Campaigns'],
        summary: 'Get campaign detail with recipient list',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Campaign detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/Campaign' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      patch: {
        tags: ['Campaigns'],
        summary: 'Update campaign (draft only)',
        description: 'All fields are optional. If `recipientIds` is provided it **replaces** the entire recipient list — existing recipients not in the new array will be removed.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name:         { type: 'string', example: 'Updated Newsletter' },
                  subject:      { type: 'string', example: 'New subject line' },
                  body:         { type: 'string', example: '<h1>Updated body</h1>' },
                  recipientIds: {
                    type: 'array',
                    items: { type: 'integer' },
                    example: [1, 2, 3],
                    description: 'Replaces ALL existing recipients. Must be non-empty if provided.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Campaign' } } } },
          409: { description: 'Campaign is not in draft status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Campaigns'],
        summary: 'Delete campaign (draft only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Deleted' },
          409: { description: 'Campaign is not in draft status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/campaigns/{id}/schedule': {
      post: {
        tags: ['Campaigns'],
        summary: 'Schedule campaign for future send',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['scheduledAt'],
                properties: {
                  scheduledAt: {
                    type: 'string',
                    format: 'date-time',
                    example: '2026-05-01T09:00:00.000Z',
                    description: 'Must be a future timestamp',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Campaign scheduled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Campaign' } } } },
          400: { description: 'scheduledAt is not in the future', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { description: 'Campaign is not in draft status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/campaigns/{id}/send': {
      post: {
        tags: ['Campaigns'],
        summary: 'Trigger async send (returns 202 immediately)',
        description: 'Sets campaign status to `sending` and starts async delivery in the background. Returns the updated campaign immediately — do not wait for delivery to finish. Poll `GET /campaigns/:id/stats` to track progress.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          202: {
            description: 'Send initiated — campaign is now in `sending` status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data:    { $ref: '#/components/schemas/Campaign' },
                    message: { type: 'string', example: 'Campaign send initiated. Poll GET /campaigns/:id/stats to track progress.' },
                  },
                },
              },
            },
          },
          409: { description: 'Campaign is not in draft or scheduled status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Campaign not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/campaigns/{id}/stats': {
      get: {
        tags: ['Campaigns'],
        summary: 'Get campaign delivery statistics',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Campaign stats',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CampaignStats' } } },
          },
        },
      },
    },

    // ── Recipients ────────────────────────────────────────────────────
    '/recipients': {
      get: {
        tags: ['Recipients'],
        summary: 'List all recipients (paginated)',
        parameters: [
          { name: 'page',  in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: {
            description: 'Paginated recipient list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Recipient' } },
                    meta: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/recipient': {
      post: {
        tags: ['Recipients'],
        summary: 'Create a new recipient',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'name'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'jane@example.com' },
                  name:  { type: 'string', example: 'Jane Smith' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Recipient created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Recipient' } } } },
          409: { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          422: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
  },
};

export const swaggerUiOptions: Record<string, unknown> = {
  customSiteTitle: 'Campaign Manager API',
  swaggerOptions: {
    persistAuthorization: true,  // keeps JWT across page reloads
  },
};
