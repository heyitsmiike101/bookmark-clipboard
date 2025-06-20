# Bookmarks Dashboard

A sleek and responsive HTML dashboard to manage and display categorized bookmarks with live availability checks (pinging). Designed for personal use, productivity, and ease of access.

## ✨ Features

- 🔍 **Searchable** interface for fast bookmark filtering
- 🧠 **Grouped by category** for organization
- ✅ **Live ping status** using favicon loading to check site availability
- 🔁 **Automatic re-check** every 10 seconds
- 🎯 **Offline detection** with visual cues (red border/text)


## 🧠 How It Works

- Bookmarks are defined in a JavaScript object and grouped by category.
- Tiles with `"ping": true` will attempt to load the site's favicon to determine online/offline status.
- The status is updated every 10 seconds.
- A search input dynamically filters bookmarks by name or category.

## ✅ Example Bookmark JSON

Inside the script, you’ll find a dictionary like:

```javascript
const bookmarks = {
  "Tech Links": [
    { "name": "OpenAI", "url": "https://www.openai.com", "ping": true },
    ...
  ],
  "Learning Resources": [
    { "name": "Coursera", "url": "https://www.coursera.org", "ping": true },
    ...
  ]
};
```

## 🖥️ Usage

1. Open `bookmarks.html` in any modern browser.
2. View or search your categorized bookmarks.
3. Click to open any bookmark in a new tab.
4. Sites that are offline will appear in red with a border change.

## ⚙️ Customization

To add or modify bookmarks:
- Edit the `bookmarks` object in the `<script>` section.
- Add `"ping": true` to any link to enable availability checking.

---

Crafted for utility and clarity. No external libraries. No build steps. Just open and go.
