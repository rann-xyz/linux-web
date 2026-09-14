# Linux Web Terminal

A web-based terminal emulator for Linux systems with Docker container isolation and persistent storage.

## Features

- 🌐 Web-based terminal interface
- 🐳 Docker container isolation per user
- 💾 Persistent file storage
- 🔐 User authentication with JWT
- 📊 Resource limits and monitoring
- ⚡ Real-time terminal communication via WebSocket
- 🎨 Modern UI with React & Next.js
- 📱 Responsive design

## Architecture

- **Frontend**: Next.js + React + Tailwind CSS
- **Backend**: Express + TypeScript + PostgreSQL
- **Terminal**: Xterm.js
- **Deployment**: Railway + Docker

## Prerequisites

- Node.js 20+
- PostgreSQL 13+
- Docker & Docker Compose
- npm or yarn

## Setup

### Environment Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update `.env` with your configuration:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/linux_web_db
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:3000
```

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start PostgreSQL (using Docker Compose):
```bash
cd backend
docker-compose up -d
```

3. Run database migrations:
```bash
psql -U postgres -d linux_web_db -f src/db/schema.sql
```

4. Start development servers:
```bash
# In separate terminals
npm run dev              # Backend
npm run dev:frontend     # Frontend
```

### Production Deployment

#### Using Railway

1. Connect your GitHub repository to Railway
2. Add PostgreSQL plugin
3. Set environment variables in Railway dashboard
4. Deploy using `railway up` CLI

#### Using Docker

```bash
# Build
docker build -f backend/Dockerfile -t linux-web-backend .

# Run
docker-compose -f backend/docker-compose.yml up
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout

### Terminal
- `GET /api/terminal/sessions` - List user sessions
- `POST /api/terminal/sessions` - Create new session
- `DELETE /api/terminal/sessions/:id` - Terminate session

### Containers
- `GET /api/containers` - List containers
- `POST /api/containers/:id/exec` - Execute command

### Health
- `GET /health` - Health check endpoint

## WebSocket Events

- `terminal:data` - Terminal output
- `terminal:command` - Execute terminal command
- `terminal:resize` - Resize terminal

## Troubleshooting

### Database connection failed
- Check PostgreSQL is running
- Verify DATABASE_URL in .env
- Run: `psql -U postgres -h localhost -l`

### Port already in use
- Backend: `PORT=3001 npm run dev`
- Frontend: `PORT=3001 npm run dev:frontend`

### Docker build fails
- Clear cache: `docker system prune -a`
- Rebuild: `docker build --no-cache ...`

## Development

### Project Structure
```
.
├── backend/
│   ├── src/
│   │   ├── server.ts           # Express server
│   │   ├── db/                 # Database
│   │   ├── routes/             # API routes
│   │   ├── middleware/         # Express middleware
│   │   ├── utils/              # Utility functions
│   │   └── containers/         # Container management
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/              # Next.js pages
│   │   ├── components/         # React components
│   │   └── styles/             # CSS modules
│   ├── public/
│   └── package.json
└── README.md
```

## License

MIT
