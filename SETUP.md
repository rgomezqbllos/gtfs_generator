# GTFS Generator - Setup & Deployment Guide

## Prerequisites
- **Node.js**: v18 or higher.
- **Docker**: Required for OSRM (routing engine).
- **Git**: For version control.

## Environment Variables
The application supports the following environment variables. You can create a `.env` file in the `server/` directory.

### Server (`server/.env`)
| Variable | Descirption | Default |
| :--- | :--- | :--- |
| `PORT` | The port the backend server runs on. | `3001` |
| `OSRM_PORT` | The port the OSRM Docker container listens on. | `5001` |
| `OSRM_CONTAINER_NAME` | Name of the OSRM Docker container. | `gtfs-osrm-server` |

### Client (`client/.env`)
| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_API_URL` | URL of the backend API. | `/api` (relative) |

> **Note**: In development, `VITE_API_URL` is not needed because the Vite proxy forwards `/api` to `http://localhost:3001`. In production, the frontend is served by the backend, so the relative path `/api` works automatically.

## Development
To run the application in development mode (hot-reloading):

1.  **Start the Server**:
    ```bash
    cd server
    npm install
    npm run dev
    ```
    *Server runs on http://localhost:3001*

2.  **Start the Client**:
    ```bash
    cd client
    npm install
    npm run dev
    ```
    *Client runs on http://localhost:5173*

    > The client automatically proxies API requests to the server.

## Production / Deployment
To deploy the application to a new machine or environment:

1.  **Build the Frontend**:
    ```bash
    cd client
    npm install
    npm run build
    ```
    This creates a `dist` folder in `client/`.

2.  **Setup the Server**:
    ```bash
    cd server
    npm install
    npm run build
    ```

3.  **Run the Application**:
    ```bash
    # From server directory
    npm start
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
