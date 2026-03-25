# Health and Fitness Tracking Web App (MVP)

Vue 3 + Vite + Pinia + Axios frontend, Node.js + Express + Mongoose backend, MongoDB Atlas database.

## Project Structure

- `frontend`: Vue app
- `backend`: Express API
- `backend/src/models`: Mongoose models
- `backend/src/config/db.js`: MongoDB connection

## Quick Start

### 1) Database

- Backend uses MongoDB Atlas.
- Configure `MONGODB_URI` and `MONGODB_DB_NAME` in `backend/.env`.

### 2) Backend

1. Copy `backend/.env.example` to `backend/.env`
2. Fill your MongoDB and JWT values
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
- `GET /api/user/profile`
- `PUT /api/user/profile`
- `POST /api/health/save`
- `GET /api/health/history/:userId`
- `GET /api/dashboard`

## Notes

- JWT is required for most business APIs.
- BMI formula: `weight(kg) / height(m)^2`
- This is a student-friendly MVP: clear module split and simple UI.
