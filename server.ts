import _http from "http";
import _url, { pathToFileURL } from "url";
import _fs from "fs";
import _express from "express";
import _dotenv from "dotenv";
import _cors from "cors";
import _fileUpload from "express-fileupload";
import axios from 'axios';
//import fs from "fs-extra";
import path from "path";
import { Resend } from 'resend';
//import { google } from "google-auth-library";


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




//const resend = new Resend("re_JXkLPj2Q_6ruy2HK5LBSaB1nVD1kvsGYq"); //garzinodavide
const resend = new Resend("re_CYvEt6oi_8Jr4Z3TGa9wgAjk1y47ZR3SM");  //d.garzino


async function sendEmailWithData(state: any) {

    let esitoColor = "#cccccc"; // default grigio

    if (state.esito === "OK") {
        esitoColor = "#28a745"; // verde
    } else if (state.esito === "KO") {
        esitoColor = "#dc3545"; // rosso
    } else if (state.esito === "VERIFICARE CON OF") {
        esitoColor = "#fd7e14"; // arancione
    }


    try {

        // 🔥 scarico tutte le foto
        const attachments = [];

        for (let i = 0; i < state.foto.length; i++) {
            const buffer = await downloadTelegramFile(state.foto[i]);

            if (buffer) {
                attachments.push({
                    filename: `foto_${i + 1}.jpg`,
                    content: buffer
                });
            }
        }

        const htmlContent = `
<div style="background-color:#f4f6f8;padding:30px 10px;font-family:Arial,Helvetica,sans-serif;">
    
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.05);">
        
        <!-- HEADER -->
        <div style="background:#1f2937;padding:20px;text-align:center;">
            <h2 style="color:#ffffff;margin:0;font-size:22px;">
                REPORT TECNICO ONFIELD
            </h2>
        </div>

        <!-- CONTENUTO -->
        <div style="padding:25px;">
            
            <!-- CLIENTE -->
            <h3 style="margin-top:0;color:#111827;font-size:20px;">
                ${state.cliente}
            </h3>

            <table width="100%" cellpadding="8" style="border-collapse:collapse;font-size:14px;">
                <tr>
                    <td style="color:#6b7280;"><strong>Operatore</strong></td>
                    <td style="color:#111827;">${state.azienda}</td>
                </tr>
                <tr style="background:#f9fafb;">
                    <td style="color:#6b7280;"><strong>Segnale riscontrato</strong></td>
                    <td style="color:#111827;">${state.segnale}</td>
                </tr>
                <tr>
                    <td style="color:#6b7280;"><strong>Esito</strong></td>
                    <td>
                        <span style="
                            background-color:${esitoColor};
                            color:white;
                            padding:6px 12px;
                            border-radius:20px;
                            font-weight:bold;
                            font-size:13px;
                            display:inline-block;
                        ">
                            ${state.esito}
                        </span>
                    </td>
                </tr>
            </table>

            <!-- NOTE -->
            <div style="margin-top:20px;padding:15px;background:#f9fafb;border-radius:6px;">
                <strong style="color:#374151;">Note aggiuntive</strong>
                <p style="margin:8px 0 0 0;color:#111827;font-size:14px;line-height:1.5;">
                    ${state.note}
                </p>
            </div>

            <!-- POSIZIONE -->
            <div style="margin-top:30px;text-align:center;">
                
                <h4 style="
                    margin-bottom:15px;
                    color:#111827;
                    font-size:16px;
                    letter-spacing:1px;
                ">
                    📍 POSIZIONE
                </h4>

                <div style="
                    font-size:15px;
                    color:#374151;
                    background:#f9fafb;
                    display:inline-block;
                    padding:10px 18px;
                    border-radius:6px;
                    font-weight:500;
                ">
                    ${state.lat}, ${state.lng}
                </div>

                <div style="margin-top:18px;">
                    <a href="https://www.google.com/maps?q=${state.lat},${state.lng}" 
                       target="_blank"
                       style="
                        background:#2563eb;
                        color:white;
                        text-decoration:none;
                        padding:10px 22px;
                        border-radius:6px;
                        font-size:14px;
                        display:inline-block;
                       ">
                        Apri su Google Maps
                    </a>
                </div>

            </div>

        </div>

        <!-- FOOTER -->
        <div style="background:#f3f4f6;padding:15px;text-align:center;font-size:12px;color:#6b7280;">
            Report generato automaticamente dal sistema, non rispondere alla mail
        </div>

    </div>
</div>
`;

        await resend.emails.send({
            from: "onboarding@resend.dev",
            to: "d.garzino@isiline.net",
            subject: `[preverifica FWA] ESITO ${state.tipo} FWA - ${state.cliente}`,
            html: htmlContent,
            attachments
        });

        console.log("✅ Email con foto inviata con successo!");

    } catch (error) {
        console.error("Errore invio email:", error);
    }
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


async function downloadTelegramFile(fileId: string) {
    try {
        // 1. Ottengo il file_path
        const fileResponse = await axios.post(`${TELEGRAM_API}/getFile`, {
            file_id: fileId
        });

        const filePath = fileResponse.data.result.file_path;

        // 2. URL reale del file
        const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

        // 3. Scarico il file come buffer
        const fileDownload = await axios.get(fileUrl, {
            responseType: "arraybuffer"
        });

        return Buffer.from(fileDownload.data);

    } catch (error) {
        console.error("Errore download file:", error);
        return null;
    }
}


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
                            [{ text: "COMINO GRAZIANO", callback_data: "comino_graziano" }],
                            [{ text: "BF IMPIANTI", callback_data: "bf_impianti" }],
                            [{ text: "CAU VALENTINO", callback_data: "cau_valentino" }],
                            [{ text: "BONO IMPIANTI", callback_data: "bono_impianti" }]
                        ]
                    }
                });
            }

            // STEP 2 - SCELTA AZIENDA
            else if (data === "comino_graziano" || data === "bf_impianti" || data === "cau_valentino" || data === "bono_impianti") {
                state.azienda = data;
                state.step = "cliente";
                await disableButton(callbackQuery.message.message_id, chatId, data);
                await sendTelegramMessage(chatId, "Inserisci il nome del cliente (COGNOME E NOME):");
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

                state.step = "posizione"; // 🔥 Torno allo step posizione

                await axios.post(`${TELEGRAM_API}/sendMessage`, {
                    chat_id: chatId,
                    text: "Reinvia la posizione corretta 📍",
                    reply_markup: {
                        keyboard: [[{ text: "Invia posizione 📍", request_location: true }]],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });
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

            state.cliente = text.trim().toUpperCase(); // 🔥 MAIUSCOLO
            state.step = "segnale";

            await sendTelegramMessage(
                chatId,
                "Inserisci il segnale riscontrato (numero tra 1 e 98):"
            );

            return;
        }

        // SEGNALE (numero tra 1 e 98 con classificazione)
        if (state.step === "segnale" && text) {

            const numero = Number(text.trim());

            if (
                !Number.isInteger(numero) ||
                numero <= 0 ||
                numero >= 99
            ) {
                await sendTelegramMessage(
                    chatId,
                    "⚠️ Inserisci un numero valido compreso tra 1 e 98."
                );
                return;
            }

            state.segnale = numero;

            // 🔥 CLASSIFICAZIONE AUTOMATICA
            if (numero < 70) {
                state.esito = "OK";
            } else if (numero >= 70 && numero <= 75) {
                state.esito = "VERIFICARE CON OF";
            } else {
                state.esito = "KO";
            }

            state.step = "note";

            await sendTelegramMessage(chatId, "Inserisci le note (minimo 5 caratteri):");

            return;
        }

        // NOTE (minimo 5 caratteri)
        if (state.step === "note" && text) {

            const notePulite = text.trim();

            if (notePulite.length < 5) {
                await sendTelegramMessage(
                    chatId,
                    "⚠️ Inserisci minimo 5 caratteri."
                );
                return;
            }

            state.note = notePulite;
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

        // FOTO - gestione corretta (no duplicati dimensioni)
        if (state.step === "foto" && update.message.photo) {

            // Prendo SOLO la versione più grande della foto
            const photos = update.message.photo;
            const largestPhoto = photos[photos.length - 1];
            const fileId = largestPhoto.file_id;

            // 🔒 Evito duplicati (extra sicurezza)
            if (!state.foto.includes(fileId)) {
                state.foto.push(fileId);
                state.fotoCount++;
            }

            if (state.fotoCount < 3) {
                await sendTelegramMessage(
                    chatId,
                    `Foto ${state.fotoCount} ricevuta ✅ Inviami la prossima.`
                );
            } else {

                // 🔒 CONTROLLO FINALE DATI
                const requiredFields = [
                    state.tipo,
                    state.azienda,
                    state.cliente,
                    state.segnale,
                    state.esito,
                    state.note,
                    state.lat,
                    state.lng
                ];

                const hasUndefined = requiredFields.some(
                    value => value === undefined || value === null
                );

                // Controllo anche che abbia almeno 1 foto
                if (hasUndefined || !state.foto || state.foto.length === 0) {

                    await sendTelegramMessage(
                        chatId,
                        "❌ Hai sbagliato qualcosa, ho dei valori undefined chiama 3333871022."
                    );

                    delete userStates[chatId];
                    return;
                }

                // ✅ SOLO QUI mando il successo
                await sendTelegramMessage(chatId, "✅ Procedura completata con successo!");

                // 🔥 Invio email
                await sendEmailWithData(state);

                // 🧹 Pulizia memoria
                delete userStates[chatId];
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




























