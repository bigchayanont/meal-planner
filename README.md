# House Meal Planner

House Meal Planner is a mobile-friendly shared weekly planner for lunch and dinner at your house. It is designed for around 5 to 10 friends and uses Firebase Realtime Database so everyone can update attendance from their phone.

## Files

- `index.html`: main app shell
- `styles.css`: mobile-friendly layout and visuals
- `app.js`: weekly planner logic and Firebase sync
- `firebase-config.example.js`: copy this and add your Firebase project keys

## Firebase setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
2. Add a Web app to the project.
3. Create a Realtime Database and start in test mode while you are setting it up.
4. Edit `firebase-config.js` in this folder.
5. Paste your Firebase web config values into `firebase-config.js`.

Example:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

## Realtime Database rules

If you want everyone with the link to be able to edit, you can start with simple rules like this:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Important: this is open editing. It is fine for a small friend group, but anyone with the site can change data. Later, you can tighten this with Firebase Auth.

## Run locally

Because the app uses ES modules, serve it from a local web server instead of opening the file directly.

If you have Python installed:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Deploy to GitHub Pages

1. Create a new GitHub repository.
2. Put these files in the repository root.
3. Commit and push to GitHub.
4. In GitHub, open `Settings` > `Pages`.
5. Under `Build and deployment`, choose `Deploy from a branch`.
6. Select your main branch and the `/root` folder.
7. Save.

Your site will be published at a GitHub Pages URL like:

`https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/`

Because GitHub Pages serves a static site, `firebase-config.js` must be committed with your Firebase web app config so browsers can connect to your database.

## Notes

- The planner shows Monday to Sunday for the current week.
- Each friend gets a profile card and can be marked attending for lunch or dinner.
- The layout is designed to work well on iPhone and other small screens.
