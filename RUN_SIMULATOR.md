# Run the phone simulator (live testing)
Needs Node 22+.
```
cd shield-fitness-user
npm ci
npx vite --port 5199
```
Open http://localhost:5199/simulator.html  (phone frame, device picker, rotate, reload, reset data; install gate bypassed in dev).
For real-device testing: `npx vite --host`, then open http://<your-pc-ip>:5173/?bypass-gate on your phone (same Wi-Fi).
