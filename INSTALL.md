# 📖 Installing Lumen

Hey! Here's how to get Lumen running. It takes about 5 minutes.

Lumen is a cozy PDF reader with music, notes, a timer — and a **private AI that
can answer questions about the book you're reading**, all running on your own
computer (nothing gets uploaded anywhere).

---

## Step 1 — Install the app (1 min)

1. Double-click **`Lumen-1.0.0-win-x64.exe`**.
2. Windows may show a blue **"Windows protected your PC"** box. This is normal —
   it just means the app isn't code-signed (it's a personal project, not a
   company). Click **More info → Run anyway**.
3. Choose where to install it and click through. Done — Lumen opens.

👉 **You can already read PDFs, play music, take notes, and use the timer.**
Just drag a PDF into the window (or click **Files 📂 → Browse**).

The AI chat needs two more quick steps. If you don't care about the "chat with
your book" feature, you can stop here!

---

## Step 2 — Install Ollama (2 min)

Lumen uses a free tool called **Ollama** to run the AI on your machine.

1. Go to **https://ollama.com/download**
2. Download and install it (just click through — it runs quietly in the
   background afterward).

---

## Step 3 — Download the two AI models (2 min + download time)

The AI needs two "models": one to *read* your PDF and one to *answer* you.

Open **PowerShell** or **Command Prompt** (press the Windows key, type
`powershell`, hit Enter) and paste these **one at a time**:

```
ollama pull nomic-embed-text
```

```
ollama pull llama3.2
```

- The first is tiny (~275 MB).
- The second is the chat model (~2 GB) — this download takes a few minutes
  depending on your internet.

You only ever download these once.

---

## Step 4 — You're done! 🎉

1. Open Lumen, drag in a PDF.
2. Click **Chat 💬** on the right edge, pick your book, and ask a question.
3. The first question after adding a book takes a moment while it "reads" the
   PDF — after that it's quick.

---

## Good to know

- **Everything is private.** Your PDFs, notes, and chats never leave your
  computer.
- **Works on any PC.** If you have a good graphics card (NVIDIA), the AI runs
  faster automatically — but it works fine without one, just a bit slower.
- **Space needed:** ~200 MB for the app + ~2.3 GB for the two models.
- **Prefer a cloud AI instead?** In the chat's ⚙ settings you can switch to an
  API (OpenAI, Groq, etc.) with your own key — then you don't need Ollama at all.

## If something's off

- **"Chat doesn't answer / error about a model"** → make sure you ran both
  `ollama pull` commands above, and that Ollama is running (search "Ollama" in
  the Start menu and open it).
- **`ollama` not recognized in the terminal?** → close and reopen PowerShell
  after installing Ollama, or just open the Ollama app once.
- **Where's my data?** → everything's stored in `%APPDATA%\Lumen\`. Delete that
  folder to wipe everything.

Enjoy your reading nook ✨
