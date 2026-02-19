import _http from "http";
import _url, { pathToFileURL } from "url";
import _fs from "fs";
import _express from "express";
import _dotenv from "dotenv";
import _cors from "cors";
import _fileUpload from "express-fileupload";
import _streamifier from "streamifier";
import _bcrypt from "bcryptjs";
import _jwt from "jsonwebtoken";
import axios from 'axios';
import crypto from 'crypto';
import nodemailer from "nodemailer";
import fs from "fs-extra";
import path from "path";

// Variabili relative a MongoDB ed Express
import { MongoClient, ObjectId } from "mongodb";
const DBNAME = process.env.DBNAME;
const connectionString: string = process.env.connectionStringAtlas;

// Lettura delle password e parametri fondamentali
_dotenv.config({ "path": ".env" });
const { RestClientV5 } = require('bybit-api');

const PRIVATE_KEY = _fs.readFileSync("./keys/privateKey.pem", "utf8");
const CERTIFICATE = _fs.readFileSync("./keys/certificate.crt", "utf8");
const ENCRYPTION_KEY = _fs.readFileSync("./keys/encryptionKey.txt", "utf8");
const CREDENTIALS = { "key": PRIVATE_KEY, "cert": CERTIFICATE };
const app = _express();

// Creazione ed avvio del server
// app è il router di Express, si occupa di tutta la gestione delle richieste http
const PORT: number = parseInt(process.env.PORT);
let API_KEY_BYBIT = process.env.API_KEY_BYBIT;
let SECRET_API_KEY_BYBIT = process.env.SECRET_API_KEY_BYBIT;
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

// Scarica foto da Telegram
async function downloadTelegramFile(fileId: string, token: string, destFolder: string) {
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
        return fileName;
    } catch (err: any) {
        console.error("Errore download foto:", err.message);
        return null;
    }
}

// Invia mail completa
export async function sendEmailWithData(state: any) {
    const destFolder = path.join(__dirname, "temp_photos");
    await fs.ensureDir(destFolder);

    const attachments: any[] = [];
    for (let i = 0; i < state.foto.length; i++) {
        const filePath = await downloadTelegramFile(state.foto[i], process.env.TELEGRAM_BOT_TOKEN!, destFolder);
        if (filePath) attachments.push({ filename: `foto_${i + 1}.jpg`, path: filePath });
    }

    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: "garzinodavide@gmail.com",
            pass: process.env.GMAIL_APP_PASSWORD
        },
        tls: {
            rejectUnauthorized: false,
            family: 4 // forza IPv4
        }
    });

    const subject = `PREVERIFICA - ${state.cliente}`;
    const text = `
Posizione:
Lat: ${state.lat}, Lng: ${state.lng}

Segnale: ${state.segnale}

Note: ${state.note}

Preverifica di: ${state.azienda}
`;

    try {
        await transporter.sendMail({
            from: "garzinodavide@gmail.com",
            to: "garzinodavide@gmail.com",
            subject,
            text,
            attachments
        });
        console.log("✅ Mail inviata con foto scaricate!");
    } catch (err: any) {
        console.error("❌ Errore invio mail:", err.message);
    }

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

        // Funzione helper per rimuovere bottoni e messaggio
        const removeInlineButtons = async (msg: any) => {
            if (!msg) return;
            await axios.post(`${TELEGRAM_API}/editMessageReplyMarkup`, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                reply_markup: {}
            });
            await axios.post(`${TELEGRAM_API}/editMessageText`, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                text: "" // rimuove anche la scritta
            });
        };

        /*
        ===========================
        CLICK PULSANTI (callback_query)
        ===========================
        */
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const data = callbackQuery.data;

            // Rimuovo bottoni e testo vecchio
            await removeInlineButtons(callbackQuery.message);

            await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });

            // STEP 1 - PREVERIFICA / ATTIVAZIONE
            if (data === "preverifica") {
                state.tipo = "PREVERIFICA";
                const msg = await axios.post(`${TELEGRAM_API}/sendMessage`, {
                    chat_id: chatId,
                    text: "Scegli azienda:",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "COMINO", callback_data: "comino" }],
                            [{ text: "BF IMPIANTI", callback_data: "bf_impianti" }]
                        ]
                    }
                });
                return;
            }

            // STEP 2 - SCELTA AZIENDA
            else if (data === "comino" || data === "bf_impianti") {
                state.azienda = data;
                state.step = "cliente";
                await sendTelegramMessage(chatId, "Inserisci il nome del cliente:");
                return;
            }

            // CONFERMA POSIZIONE
            else if (data === "posizione_si") {
                state.step = "foto";
                state.fotoCount = 0;
                state.foto = [];
                await sendTelegramMessage(chatId, "Perfetto. Inviami 3 foto 📸");
                return;
            } else if (data === "posizione_no") {
                state.step = "posizione";
                await sendTelegramMessage(chatId, "Reinvia la posizione corretta.");
                return;
            }

            // START AGAIN
            else if (data === "start_again") {
                delete userStates[chatId];
                const msg = await axios.post(`${TELEGRAM_API}/sendMessage`, {
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

            return;
        }

        /*
        ===========================
        MESSAGGI TESTO / POSIZIONE / FOTO
        ===========================
        */
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

            // Rimuovo pulsante invio posizione
            await axios.post(`${TELEGRAM_API}/sendMessage`, {
                chat_id: chatId,
                text: "Posizione ricevuta ✅",
                reply_markup: { remove_keyboard: true }
            });

            // Chiedo conferma
            const msg = await axios.post(`${TELEGRAM_API}/sendMessage`, {
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

        // FOTO
        if (state.step === "foto" && update.message.photo) {
            const photos = update.message.photo;
            const fileId = photos[photos.length - 1].file_id;
            state.foto.push(fileId);
            state.fotoCount++;

            if (state.fotoCount < 3) {
                await sendTelegramMessage(chatId, `Foto ${state.fotoCount} ricevuta ✅ Inviami la prossima.`);
            } else {
                await sendTelegramMessage(chatId, "✅ Procedura completata con successo!");

                // INVIO MAIL
                await sendEmailWithData(state);

                // Reset stato
                delete userStates[chatId];

                // Pulsante START per ricominciare
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
// Chiamata a MongoDB
//********************************************************************************************//
async function analisi(chatId: any) {

    const client = new MongoClient(connectionString);
    await client.connect();

    let collection = client.db(DBNAME).collection("Trades");

    // ritorno la Promise
    let rq = collection.find({}).toArray();

    return rq
        .then((data) => {

            let vinti = 0;
            let persi = 0;

            data.forEach(t => {
                if (t.Vinto === true) vinti++;
                if (t.Perso === true) persi++;
            });

            return {
                totale: data.length,
                vinti,
                persi
            };
        })
        .catch((err) => {
            throw new Error("Errore esecuzione query: " + err);
        })
        .finally(() => client.close());
}

function creaRecord(record, tipo) {

    const client = new MongoClient(connectionString);

    return client.connect()
        .then(() => {

            let collection = client.db(DBNAME).collection("Trades");

            // Preparo il documento da salvare
            let doc = {
                Operazione: "ETHUSDT",          // se vuoi lo puoi passare da fuori
                Vinto: tipo === "vinto" ? record === true : false,
                Perso: tipo === "perso" ? record === true : false
            };

            // Inserimento nel DB
            return collection.insertOne(doc);
        })
        .then((result) => {

            // Ritorno il documento appena salvato
            return {
                _id: result.insertedId,
                Operazione: "ETHUSDT",
                Vinto: tipo === "vinto" ? record === true : false,
                Perso: tipo === "perso" ? record === true : false
            };
        })
        .catch((err) => {
            throw new Error("Errore inserimento operazione: " + err);

        })
        .finally(() => client.close());
}

//********************************************************************************************//
// Fine chiamata a MongoDB
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






