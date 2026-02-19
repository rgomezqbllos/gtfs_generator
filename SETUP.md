# GTFS Generator - Setup & Deployment Guide

## Prerequisites
- **Node.js**: v18 or higher.
- **Docker**: Optional (required only if you want OSRM local).
- **Git**: For version control.

## Environment Variables
The application supports the following environment variables. You can create a `.env` file in the `server/` directory.

### Server (`server/.env`)
| Variable | Descirption | Default |
| :--- | :--- | :--- |
| `PORT` | The port the backend server runs on. | `3001` |
| `OSRM_API_URL` | OSRM base URL for routing. | `https://router.project-osrm.org/route/v1/driving` |
| `DB_PATH` | Path to the SQLite database file. | `server/gtfs.db` |

### Client (`client/.env`)
| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_API_URL` | URL of the backend API. | `/api` (relative) |

> **Note**: In development, `VITE_API_URL` is not needed because the Vite proxy forwards `/api` to `http://localhost:3001`. In production, the frontend is served by the backend, so the relative path `/api` works automatically.

## Development
To run the application in development mode (hot-reloading):

1.  **Install dependencies**:
    ```bash
    npm run install:all
    ```

2.  **(Optional) Start OSRM locally**:
    ```bash
    npm run osrm:setup -- bogota
    ```

3.  **Start the app**:
    ```bash
    npm start
    ```

    *Backend runs on http://localhost:3001 and Vite on http://localhost:5173*

## Production / Deployment
To deploy the application to a new machine or environment:

1.  **Build client + server**:
    ```bash
    npm run build
    ```

2.  **Run the application**:
    ```bash
    npm run start:prod
    ```
    
    The server will now:
    -   Start on port `3001` (or your configured `PORT`).
    -   Serve the frontend static files from `../client/dist`.
    -   Handle all API requests.

    **Access the app at:** `http://localhost:3001` (or your server's IP/domain).

## Docker Deployment (Optional)
If you wish to containerize the entire app, you can create a Dockerfile that:
1.  Copies both client and server code.
2.  Builds the client.
3.  Builds the server.
4.  Exposes the server port.
