# Health and Fitness Tracking Web App (MVP)

Vue 3 + Vite + Pinia + Axios frontend, Node.js + Express backend, SQLite database.

## Project Structure

- `frontend`: Vue app
- `backend`: Express API
- `backend/sql/schema.sql`: database schema
- `backend/sql/seed.sql`: seed data

## Quick Start

### 1) Database

- Backend uses SQLite file database (`backend/database.sqlite`)
- Tables are auto-initialized when backend starts (`src/config/initDb.js`)
- Optional schema file: `backend/sql/schema.sql`

### 2) Backend

1. Copy `backend/.env.example` to `backend/.env`
2. Fill your SQLite and JWT values
3. Install dependencies:
   - `cd backend`
   - `npm install`
4. Run:
   - `npm run dev`

Backend default URL: `http://localhost:5000`

### 3) Frontend

1. Copy `frontend/.env.example` to `frontend/.env`
2. Install dependencies:
   - `cd frontend`
   - `npm install`
3. Run:
   - `npm run dev`

Frontend default URL: `http://localhost:5173`

## Core API Examples

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/users/me`
- `POST /api/assessments`
- `GET /api/dashboard`
- `GET /api/courses`
- `POST /api/workouts/records`
- `GET /api/schedules`
- `POST /api/favorites`

## Notes

- JWT is required for most business APIs.
- BMI formula: `weight(kg) / height(m)^2`
- This is a student-friendly MVP: clear module split and simple UI.
