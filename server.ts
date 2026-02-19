import _http from "http";
import _url, { pathToFileURL } from "url";
import _fs from "fs";
import _express from "express";
import _dotenv from "dotenv";
import _cors from "cors";
import _fileUpload from "express-fileupload";
import axios from 'axios';
import fs from "fs-extra";
import path from "path";
import { google } from "googleapis";

// Variabili relative a MongoDB ed Express
import { MongoClient, ObjectId } from "mongodb";
const DBNAME = process.env.DBNAME;
const connectionString: string = process.env.connectionStringAtlas;

// Lettura delle password e parametri fondamentali
_dotenv.config({ "path": ".env" });
const app = _express();

// Creazione ed avvio del server
// app è il router di Express, si occupa di tutta la gestione delle richieste http
const PORT: number = parseInt(process.env.PORT);
let paginaErrore;
const server = _http.createServer(app);
// Il secondo parametro facoltativo ipAddress consente di mettere il server in ascolto su una delle interfacce della macchina, se non lo metto viene messo in ascolto su tutte le interfacce (3 --> loopback e 2 di rete)
server.listen(PORT, () => {
    init();
    console.log(`Il Server è in ascolto sulla porta ${PORT}`);
});

function init() {
    _fs.readFile("./static/error.html", function (err, data) {
        if (err) {
            paginaErrore = `<h1>Risorsa non trovata</h1>`;
        }
        else {
            paginaErrore = data.toString();
        }
    });
}

//********************************************************************************************//
// Routes middleware
//********************************************************************************************//

// 1. Request log
app.use("/", (req: any, res: any, next: any) => {
    console.log(`-----> ${req.method}: ${req.originalUrl}`);
    next();
});

// 2. Gestione delle risorse statiche
// .static() è un metodo di express che ha già implementata la firma di sopra. Se trova il file fa la send() altrimenti fa la next()
app.use("/", _express.static("./static"));

// 3. Lettura dei parametri POST di req["body"] (bodyParser)
// .json() intercetta solo i parametri passati in json nel body della http request
app.use("/", _express.json({ "limit": "50mb" }));
// .urlencoded() intercetta solo i parametri passati in urlencoded nel body della http request
app.use("/", _express.urlencoded({ "limit": "50mb", "extended": true }));

// 4. Aggancio dei parametri del FormData e dei parametri scalari passati dentro il FormData
// Dimensione massima del file = 10 MB
app.use("/", _fileUpload({ "limits": { "fileSize": (10 * 1024 * 1024) } }));

// 5. Log dei parametri GET, POST, PUT, PATCH, DELETE
app.use("/", (req: any, res: any, next: any) => {
    if (Object.keys(req["query"]).length > 0) {
        console.log(`       ${JSON.stringify(req["query"])}`);
    }
    if (Object.keys(req["body"]).length > 0) {
        console.log(`       ${JSON.stringify(req["body"])}`);
    }
    next();
});

//********************************************************************************************//
// Inizio NodeMailer
//********************************************************************************************//

// Scarica un file da Telegram e restituisce il path locale
async function downloadTelegramFile(fileId: string, token: string, destFolder: string): Promise<string | null> {
  try {
    const res = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const filePath = res.data.result.file_path;
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const fileName = path.join(destFolder, path.basename(filePath));

    const writer = fs.createWriteStream(fileName);
    const response = await axios.get(url, { responseType: "stream" });
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log("📥 Foto scaricata:", fileName);
    return fileName;
  } catch (err: any) {
    console.error("❌ Errore download foto:", err.message);
    return null;
  }
}

// Converte un file in base64 **in streaming**, senza caricare tutto in memoria
function streamToBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 }); // 64 KB alla volta
    stream.on("data", (chunk) => chunks.push(chunk.toString("base64")));
    stream.on("end", () => resolve(chunks.join("")));
    stream.on("error", reject);
  });
}

// Funzione principale per inviare email
export async function sendEmailWithData(state: any) {
  const destFolder = path.join(__dirname, "temp_photos");
  await fs.ensureDir(destFolder);

  // Scarico le foto una per una
  const attachments: string[] = [];
  for (let i = 0; i < state.foto.length; i++) {
    const filePath = await downloadTelegramFile(state.foto[i], process.env.TELEGRAM_BOT_TOKEN!, destFolder);
    if (filePath) attachments.push(filePath);
  }

  // OAuth2 Gmail
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  // Inizio costruzione email
  const boundary = "boundary123";
  let emailLines: string[] = [];
  emailLines.push(`From: "Davide" <${process.env.GMAIL_USER}>`);
  emailLines.push(`To: ${process.env.GMAIL_USER}`);
  emailLines.push(`Subject: PREVERIFICA - ${state.cliente}`);
  emailLines.push(`MIME-Version: 1.0`);
  emailLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  emailLines.push(``);
  emailLines.push(`--${boundary}`);
  emailLines.push(`Content-Type: text/plain; charset="UTF-8"`);
  emailLines.push(``);
  emailLines.push(`
Posizione:
Lat: ${state.lat}, Lng: ${state.lng}

Segnale: ${state.segnale}

Note: ${state.note}

Preverifica di: ${state.azienda}
`);

  // Allegati uno per uno, in streaming base64
  for (let i = 0; i < attachments.length; i++) {
    emailLines.push(`--${boundary}`);
    emailLines.push(`Content-Type: image/jpeg; name="foto_${i + 1}.jpg"`);
    emailLines.push(`Content-Transfer-Encoding: base64`);
    emailLines.push(`Content-Disposition: attachment; filename="foto_${i + 1}.jpg"`);
    emailLines.push(``);
    const fileBase64 = await streamToBase64(attachments[i]);
    emailLines.push(fileBase64);
  }

  emailLines.push(`--${boundary}--`);

  // Converto in base64 URL safe
  const raw = Buffer.from(emailLines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw }
    });
    console.log("✅ Mail inviata via Gmail API!");
  } catch (err: any) {
    console.error("❌ Errore invio mail:", err);
  }

  // Pulisco la cartella temporanea
  await fs.emptyDir(destFolder);
}

//********************************************************************************************//
// Fine NodeMailer
//********************************************************************************************//

//********************************************************************************************//
// Inizio codice specifico delle API Telegram Bot
//********************************************************************************************//

// URL base API Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Funzione per inviare un messaggio Telegram
async function sendTelegramMessage(chatId: string, text: string) {
    try {
        const res = await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text
        });
        console.log("Messaggio Telegram inviato:", res.data);
    } catch (err: any) {
        console.error("Errore invio Telegram:", err.response?.data || err.message);
    }
}

const userStates: any = {};

async function handleTelegramUpdate(update: any) {
    try {
        const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
        if (!chatId) return;

        if (!userStates[chatId]) userStates[chatId] = {};
        const state = userStates[chatId];

        /* ===========================
           CALLBACK QUERY
        =========================== */
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const data = callbackQuery.data;

            await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });

            // Funzione per nascondere il pulsante cliccato
            async function disableButton(messageId: number, chatId: number, callbackDataToRemove: string) {
                const message = callbackQuery.message;
                if (!message || !message.reply_markup?.inline_keyboard) return;

                const newKeyboard = message.reply_markup.inline_keyboard.map(row =>
                    row.map(button =>
                        button.callback_data === callbackDataToRemove ? { ...button, text: `${button.text} ✅`, callback_data: "disabled" } : button
                    )
                );

                await axios.post(`${TELEGRAM_API}/editMessageReplyMarkup`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: newKeyboard }
                });
            }

            // STEP 1 - PREVERIFICA / ATTIVAZIONE
            if (data === "preverifica") {
                state.tipo = "PREVERIFICA";
                await disableButton(callbackQuery.message.message_id, chatId, "preverifica");

                await axios.post(`${TELEGRAM_API}/sendMessage`, {
                    chat_id: chatId,
                    text: "Scegli azienda:",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "COMINO", callback_data: "comino" }],
                            [{ text: "BF IMPIANTI", callback_data: "bf_impianti" }]
                        ]
                    }
                });
            }

            // STEP 2 - SCELTA AZIENDA
            else if (data === "comino" || data === "bf_impianti") {
                state.azienda = data;
                state.step = "cliente";
                await disableButton(callbackQuery.message.message_id, chatId, data);
                await sendTelegramMessage(chatId, "Inserisci il nome del cliente:");
            }

            // CONFERMA POSIZIONE
            else if (data === "posizione_si") {
                state.step = "foto";
                state.fotoCount = 0;
                state.foto = [];
                await disableButton(callbackQuery.message.message_id, chatId, data);
                await sendTelegramMessage(chatId, "Perfetto. Inviami 3 foto 📸");
            } else if (data === "posizione_no") {
                await disableButton(callbackQuery.message.message_id, chatId, data);
                await sendTelegramMessage(chatId, "Reinvia la posizione corretta.");
            }

            // Pulsante START dopo fine procedura
            else if (data === "start_again") {
                await disableButton(callbackQuery.message.message_id, chatId, data);
                userStates[chatId] = {};
                await sendTelegramMessage(chatId, "Procedura ricominciata. Scegli operazione:");
            }

            return;
        }

        /* ===========================
           MESSAGGI TESTO / POSIZIONE / FOTO
        =========================== */
        const text = update.message?.text || "";

        // START
        if (text === "/start") {
            userStates[chatId] = {};
            await axios.post(`${TELEGRAM_API}/sendMessage`, {
                chat_id: chatId,
                text: "Scegli operazione:",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "PREVERIFICA", callback_data: "preverifica" }],
                        [{ text: "ATTIVAZIONE", callback_data: "attivazione" }]
                    ]
                }
            });
            return;
        }

        // NOME CLIENTE
        if (state.step === "cliente" && text) {
            state.cliente = text;
            state.step = "segnale";
            await sendTelegramMessage(chatId, "Inserisci il segnale riscontrato:");
            return;
        }

        // SEGNALE
        if (state.step === "segnale" && text) {
            state.segnale = text;
            state.step = "note";
            await sendTelegramMessage(chatId, "Inserisci le note:");
            return;
        }

        // NOTE
        if (state.step === "note" && text) {
            state.note = text;
            state.step = "posizione";

            await sendTelegramMessage(chatId, "Sto recuperando la posizione... 📍");

            await axios.post(`${TELEGRAM_API}/sendMessage`, {
                chat_id: chatId,
                text: "Invia la tua posizione:",
                reply_markup: {
                    keyboard: [[{ text: "Invia posizione 📍", request_location: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
            return;
        }

        // POSIZIONE
        if (update.message.location) {
            state.lat = update.message.location.latitude;
            state.lng = update.message.location.longitude;
            state.step = "conferma_posizione";

            await axios.post(`${TELEGRAM_API}/sendMessage`, {
                chat_id: chatId,
                text: "Posizione ricevuta ✅",
                reply_markup: { remove_keyboard: true }
            });

            await axios.post(`${TELEGRAM_API}/sendMessage`, {
                chat_id: chatId,
                text: `La posizione è:\nLat: ${state.lat}\nLng: ${state.lng}\nÈ corretta?`,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "SI", callback_data: "posizione_si" }],
                        [{ text: "NO", callback_data: "posizione_no" }]
                    ]
                }
            });
            return;
        }

        // FOTO - gestione singola o multipla
        if (state.step === "foto" && update.message.photo) {
            const photos = update.message.photo;
            // prendo tutte le foto ricevute contemporaneamente
            for (let i = 0; i < photos.length; i++) {
                const fileId = photos[i].file_id;
                state.foto.push(fileId);
                state.fotoCount++;

                if (state.fotoCount >= 3) break;
            }

            if (state.fotoCount < 3) {
                await sendTelegramMessage(chatId, `Foto ${state.fotoCount} ricevuta ✅ Inviami la prossima.`);
            } else {
                await sendTelegramMessage(chatId, "✅ Procedura completata con successo!");
                await sendEmailWithData(state);
                delete userStates[chatId];

                await axios.post(`${TELEGRAM_API}/sendMessage`, {
                    chat_id: chatId,
                    text: "Vuoi iniziare una nuova procedura?",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "START", callback_data: "start_again" }]
                        ]
                    }
                });
            }
            return;
        }

        // RISPOSTA GENERICA
        if (text.toLowerCase().includes("ciao")) {
            await sendTelegramMessage(chatId, "Ciao anche a te! 😊");
            return;
        }

    } catch (error: any) {
        console.error("Errore handleTelegramUpdate:", error.response?.data || error.message);
    }
}




// Endpoint Webhook — riceve aggiornamenti da Telegram
app.post("/telegram/webhook", async (req: any, res: any) => {
    try {
        const update = req.body;
        await handleTelegramUpdate(update);
        res.send("ok");
    } catch (err) {
        console.error("Errore webhook Telegram:", err);
        res.status(500).send("Errore server webhook");
    }
});

// Endpoint per inviare messaggi manualmente via HTTP (utile per test)
app.get("/api/telegram/send", async (req: any, res: any) => {
    const chatId = req.query.chat_id;
    const msg = req.query.msg;

    if (!chatId || !msg) {
        return res.status(400).send("Parametri mancanti: chat_id e msg obbligatori");
    }

    await sendTelegramMessage(chatId, msg);
    res.send(`✅ Messaggio inviato a ${chatId}`);
});

// Endpoint per controllare lo stato del webhook (debug)
app.get("/api/telegram/info", async (req: any, res: any) => {
    try {
        const result = await axios.get(`${TELEGRAM_API}/getWebhookInfo`);
        res.send(result.data);
    } catch (err: any) {
        res.status(500).send(err.response?.data || err.message);
    }
});

//********************************************************************************************//
// Fine codice Telegram Bot
//********************************************************************************************//
//********************************************************************************************//
// Default route e gestione degli errori
//********************************************************************************************//

app.use("/", (req, res, next) => {
    res.status(404);
    if (req.originalUrl.startsWith("/api/")) {
        res.send(`Api non disponibile`);
    }
    else {
        res.send(paginaErrore);
    }
});

app.use("/", (err, req, res, next) => {
    console.log("************* SERVER ERROR ***************\n", err.stack);
    res.status(500).send(err.message);
});




























