docker run hello-world
## Run with One Command

```bash
docker-compose up
```

The app will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

## Stop the App

Press `Ctrl+C` or run:
```bash
docker-compose down
```

## Rebuild (after code changes)

```bash
docker-compose up --build
```

## View Logs

```bash
docker-compose logs -f
```

That's it! 🎉
