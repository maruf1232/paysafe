# Paysafe Telegram Bot System

This repository contains the source code for the Paysafe Telegram Bot System.

## Features
- **Main Bot**: For users to buy accounts, deposit funds, and refer friends.
- **Admin Bot**: For admins to control prices, add accounts, and broadcast messages.

## Deployment on Render
1. Connect this GitHub repository to your Render Web Service.
2. In the Render settings, set the **Build Command** to:
   ```bash
   npm install
   ```
3. Set the **Start Command** to:
   ```bash
   npm start
   ```
4. Add the following **Environment Variables** in Render:
   - `MAIN_BOT_TOKEN`: Your main bot token.
   - `ADMIN_BOT_TOKEN`: Your admin bot token.
   - `SUPABASE_URL`: Your Supabase project URL.
   - `SUPABASE_SERVICE_KEY`: Your Supabase Service Role Key.

**Note:** Since Render free tier web services go to sleep after 15 minutes of inactivity, you might want to use a free cron job service (like cron-job.org) to ping your Render URL (`https://paysafe-vj7r.onrender.com`) every 10 minutes to keep the bots awake.
