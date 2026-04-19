# Health and Fitness Tracking Web App

**Course:** COMP3510SEF · **Group:** 22  

University course group project — a simple web application for tracking health and fitness. It includes a **user-facing frontend**, a **Node.js backend API**, and a separate **admin page** (`system-status-console`) for staff-style monitoring.

**Repository:** https://github.com/Ivy0701/Health-and-Fitness-Tracking-App

The goal is to demonstrate a full-stack health tracking system.

## Tech Stack

- **Frontend:** Vue 3, Vite, Pinia, Axios  
- **Backend:** Node.js, Express, Mongoose (MongoDB), JWT  
- **Admin page:** Vue 3, Vite (runs as its own dev app)

## Project Structure

- `frontend` — main user web app  
- `backend` — REST API and database access  
- `system-status-console` — admin page (start separately when needed)

## Quick Start

👉 **You need to run the backend and the frontend at the same time** (two terminals) for the main app to work.

### 1) Database

Configure the database first so the API can save data when you start the server.

The app uses **MongoDB**. Copy `backend/.env.example` to `backend/.env` and set your connection string and database name (see the example file).

### 2) Backend

Start the backend first: the frontend talks to this server, so nothing in the browser will work until it is up.

**Backend** — provides API services for login, profiles, workouts, courses, and the rest of the app.

```bash
cd backend
npm install
npm run dev
```

Default URL: **http://localhost:5001**

### 3) Frontend

Then start the user interface: this is what you open in the browser for normal use of the app.

**Frontend** — the main user interface (register, log in, dashboard, courses, etc.).

```bash
cd frontend
npm install
npm run dev
```

Default URL: **http://localhost:5173**

### 4) Admin page

Optional: use this when you want the monitoring / admin-style screen. It is not required for the student user flow.

**Admin page** — a system monitoring interface (separate small app).

👉 **This runs separately from the main app** (its own folder and `npm run dev`).

```bash
cd system-status-console
npm install
npm run dev
```

Default URL: **http://localhost:5174** — open it in the browser and **sign in** on the login screen before using the console.

**Admin test accounts** (for testing only):

- **Email:** `admin@healthfit.local`
- **Password:** `admin123`

- **Email:** `ops@healthfit.local`
- **Password:** `ops123`

These accounts are created automatically when the backend starts and are meant for testing purposes only.

**Important:** These accounts are for testing/demo purposes only.

## Main Pages and Functions

- **Dashboard** — Overview of your activity and quick access to the main areas of the app.  
- **Courses** — Browse and follow fitness courses and track your progress.  
- **Workout** — Plan workouts and log exercises and sessions.  
- **Diet** — Record meals and nutrition-related information.  
- **Schedule** — View and manage your personal fitness and meal schedule.  
- **Profile** — Edit your profile and personal health-related settings.  
- **Favorites** — Keep a central list of saved courses, workouts, diet items, and forum content.  
- **Forum** — Read and post in the community discussion area.  
- **VIP** — View subscription options and premium benefits.

## How to Use

Follow these steps the first time you run the project:

1. 👉 **Start the backend first (required).** If the backend is not running, the frontend will not work properly.  
2. Start the **frontend**, then open **http://localhost:5173** in your browser.  
3. **Register** a new account or **log in** if you already have one.  
4. If the app asks for **onboarding**, complete it; then open **Dashboard**, **Courses**, **Workout**, **Diet**, and other sections from the navigation.  
5. To try the **admin page** only: in another terminal, start `system-status-console`, open **http://localhost:5174**, and sign in there.

## Demo Account (Optional)

You can log in directly using **test accounts** instead of registering. These accounts are **created automatically** when the backend starts (after MongoDB is configured).

**User test accounts** (for testing only):

- **Email:** `test1@example.com`
- **Password:** `Test1234`

- **Email:** `test2@example.com`
- **Password:** `Test5678`

**Admin test accounts** (for the separate admin app; for testing only):

- **Email:** `admin@healthfit.local`
- **Password:** `admin123`

- **Email:** `ops@healthfit.local`
- **Password:** `ops123`

**Important:** These accounts are for testing/demo purposes only.

## Core API Examples

👉 Examples of commonly used API endpoints.

- `POST /api/auth/register`  
- `POST /api/auth/login`  
- `GET /api/user/profile`  
- `GET /api/dashboard`

## Notes

- Start the **backend before** the frontend (or at least before you use the app in the browser).  
- **MongoDB** must be reachable with the settings in `backend/.env`.  
- Most features use **JWT** authentication after login.  
- The **admin page** is a **separate** app: install and run it with its own `npm run dev` when you need it.  
- 👉 **Make sure all services are running before testing the app.**
