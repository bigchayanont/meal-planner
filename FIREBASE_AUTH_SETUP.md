# Firebase Auth Setup

Use this setup to stop Firebase from warning that your Realtime Database is insecure.

## 1. Enable Google sign-in

In Firebase Console:

1. Open `Authentication`
2. Open `Sign-in method`
3. Enable `Google`
4. Save

## 2. Add your GitHub Pages domain

In Firebase Console:

1. Open `Authentication`
2. Open `Settings`
3. Under `Authorized domains`, add:

`bigchayanont.github.io`

## 3. Update Realtime Database rules

In Firebase Console:

1. Open `Realtime Database`
2. Open `Rules`
3. Paste the contents of `firebase-rules.json`

Rules:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

## What this does

- Visitors must sign in with Google before they can read or write planner data.
- The database is no longer open to the whole internet.
- Firebase should stop flagging the rules as publicly insecure.

## Important note

This secures the app better than open public rules, but it still allows any signed-in Google user to access the planner.

If you want the next upgrade, we can add an allowlist so only selected Google accounts can use it.
