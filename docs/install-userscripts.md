# Install Userscripts

## iPhone Safari

1. Install the Userscripts app from the App Store.
2. Open iOS Settings.
3. Go to Safari > Extensions.
4. Enable Userscripts.
5. Give it permission for the sites you want to use.
6. Import these two files:

- `userscripts/chatgpt-prompt-studio.user.js`
- `userscripts/web-clipper.user.js`

Keep both enabled.

## Desktop

Use a userscript manager such as Tampermonkey or Violentmonkey.

Install:

- `userscripts/chatgpt-prompt-studio.user.js`
- `userscripts/web-clipper.user.js`

## Configure the API URL

Open each userscript and edit the config block:

```js
const CONFIG = {
  API_BASE: "https://your-domain.example"
};
```

Use the URL where your backend server is deployed.

Do not put API keys or Notion tokens inside a userscript.
