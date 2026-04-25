import _http from "http";
import _url, { pathToFileURL } from "url";
import _fs from "fs";
import _express from "express";
import _dotenv from "dotenv";
import _cors from "cors";
import _fileUpload from "express-fileupload";
import axios from 'axios';
import _jwt from "jsonwebtoken";
import _bcrypt from "bcryptjs";
//import fs from "fs-extra";
import path from "path";
import { Resend } from 'resend';


_dotenv.config({ "path": ".env" });
// Variabili relative a MongoDB ed Express
import { MongoClient, ObjectId } from "mongodb";
const DBNAME = process.env.DBNAME;
const connectionString: string = process.env.connectionStringAtlas;
const PRIVATE_KEY = _fs.readFileSync("./keys/privateKey.pem", "utf8");
const CERTIFICATE = _fs.readFileSync("./keys/certificate.crt", "utf8");
const ENCRYPTION_KEY = _fs.readFileSync("./keys/encryptionKey.txt", "utf8");
const CREDENTIALS = { "key": PRIVATE_KEY, "cert": CERTIFICATE };

// Lettura delle password e parametri fondamentali


const app = _express();

//UTENTI AUTORIZZATI
const AUTHORIZED_USERS = [
    1022659281,   // tuo ID
    638210001,
    1763731277,
];


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

app.post("/api/login", async (req, res, next) => {
    console.log(DBNAME);
    let username = req["body"].username;
    let pwd = req["body"].password;
    console.log(username, pwd)

    const client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("login");
    let regex = new RegExp(`^${username}$`, "i");
    let rq = collection.findOne({ "username": regex }, { "projection": { "username": 1, "password": 1 } });
    rq.then((dbUser) => {
        if (!dbUser) {
            res.status(401).send("Username non valido");
        }
        else {
            _bcrypt.compare(pwd, dbUser.password, (err, success) => {
                if (err) {
                    res.status(500).send(`Bcrypt compare error: ${err.message}`);
                }
                else {
                    if (!success) {
                        res.status(401).send("Password non valida");
                    }
                    else {
                        let token = createToken(dbUser);
                        console.log(token);
                        res.setHeader("authorization", token);
                        // Fa si che la header authorization venga restituita al client
                        res.setHeader("access-control-expose-headers", "authorization");
                        res.send({ "ris": "ok" });
                    }
                }
            })
        }
    });
    rq.catch((err) => res.status(500).send(`Errore esecuzione query: ${err.message}`));
    rq.finally(() => client.close());
});

// 11. Controllo del token
app.use("/api/", (req: any, res: any, next: any) => {
    console.log("Controllo tokenccccccccccc");
    console.log(req.headers["authorization"]);
    if (!req.headers["authorization"]) {
        console.log("Token mancante");
        res.status(403).send("Token mancante");
    }
    else {
        let token = req.headers["authorization"];
        _jwt.verify(token, ENCRYPTION_KEY, (err, payload) => {
            if (err) {
                res.status(403).send(`Token non valido: ${err}`);
            }
            else {
                let newToken = createToken(payload);
                console.log(newToken);
                res.setHeader("authorization", newToken);
                // Fa si che la header authorization venga restituita al client
                res.setHeader("access-control-expose-headers", "authorization");
                req["payload"] = payload;
                next();
            }
        });
    }
});

function createToken(data) {
    let currentTimeSeconds = Math.floor(new Date().getTime() / 1000);
    let payload = {
        "_id": data._id,
        "username": data.username,
        // Se c'è iat mette iat altrimenti mette currentTimeSeconds
        "iat": data.iat || currentTimeSeconds,
        "exp": currentTimeSeconds + parseInt(process.env.TOKEN_EXPIRE_DURATION)
    }
    let token = _jwt.sign(payload, ENCRYPTION_KEY);
    return token;
}

app.get("/api/momento", async (req, res, next) => {
    res.send("ok");
});


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

async function sendEmailWithDataAttivazione(state: any) {

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
        <div style="background:#065f46;padding:20px;text-align:center;">
            <h2 style="color:#ffffff;margin:0;font-size:22px;">
                SERIALI E MAC ADDRESS FWA
            </h2>
        </div>

        <!-- CONTENUTO -->
        <div style="padding:25px;">
            
            <!-- CLIENTE -->
            <h3 style="margin-top:0;color:#111827;font-size:20px;">
                ${state.cliente}
            </h3>

            <table width="100%" cellpadding="10" style="border-collapse:collapse;font-size:14px;">
                <tr>
                    <td style="color:#6b7280;"><strong>Tipo</strong></td>
                    <td style="color:#111827;">TS INTRACOM 28GHZ + POWERINJECTOR</td>
                </tr>

                <tr style="background:#f9fafb;">
                    <td style="color:#6b7280;"><strong>Seriale TS</strong></td>
                    <td style="color:#111827;font-family:monospace;">
                        ${state.serialTS}
                    </td>
                </tr>

                <tr>
                    <td style="color:#6b7280;"><strong>MAC Address TS</strong></td>
                    <td style="color:#111827;font-family:monospace;">
                        ${state.macTS}
                    </td>
                </tr>

                <tr style="background:#f9fafb;">
                    <td style="color:#6b7280;"><strong>Seriale POE</strong></td>
                    <td style="color:#111827;font-family:monospace;">
                        ${state.serialPOE}
                    </td>
                </tr>
            </table>

            <!-- BLOCCO INFO -->
            <div style="
                margin-top:25px;
                padding:15px;
                background:#ecfdf5;
                border-radius:6px;
                text-align:center;
                font-size:14px;
                color:#065f46;
                font-weight:500;
            ">
                ✅ Dati attivazione raccolti correttamente
            </div>

            <!-- FOTO -->
            <div style="margin-top:30px;text-align:center;">
                <h4 style="
                    margin-bottom:10px;
                    color:#111827;
                    font-size:16px;
                    letter-spacing:1px;
                ">
                    📸 FOTO ALLEGATE
                </h4>

                <p style="font-size:13px;color:#6b7280;">
                    Le immagini sono incluse come allegati nella mail
                </p>
            </div>

        </div>

        <!-- FOOTER -->
        <div style="background:#f3f4f6;padding:15px;text-align:center;font-size:12px;color:#6b7280;">
            Report attivazione generato automaticamente
        </div>

    </div>
</div>
`;

        await resend.emails.send({
            from: "onboarding@resend.dev",
            to: "d.garzino@isiline.net",
            subject: `[DATI FWA] ${state.cliente}`,
            html: htmlContent,
            attachments
        });

        console.log("✅ Email attivazione inviata con successo!");

    } catch (error) {
        console.error("Errore invio email attivazione:", error);
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
async function sendTelegramMessage(
    chatId: string,
    text: string,
    replyMarkup?: any
) {
    try {
        const payload: any = {
            chat_id: chatId,
            text
        };

        if (replyMarkup) {
            payload.reply_markup = replyMarkup;
        }

        await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
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

            const validStepMap: Record<string, string | undefined> = {
                "preverifica": undefined,      // cliccabile solo all'inizio
                "attivazione": undefined,      // cliccabile solo all'inizio

                "comino_graziano": "tipo_selezione",
                "bf_impianti": "tipo_selezione",
                "cau_valentino": "tipo_selezione",
                "bono_impianti": "tipo_selezione",

                "posizione_si": "conferma_posizione",
                "posizione_no": "conferma_posizione"
            };

            const expectedStep = validStepMap[data];

            // step virtuale tipo_selezione = subito dopo PREVERIFICA
            const currentStep = state.step === "tipo" ? "tipo_selezione" : state.step;

            if (expectedStep !== undefined && expectedStep !== currentStep) {
                // 🔒 click fuori step, ignoralo
                console.log(`Click ignorato per ${data}, step attuale: ${state.step}`);
                return;
            }

            // =============================
            // LOGICA CALLBACK (rimane identica)
            // =============================

            // STEP 1 - PREVERIFICA / ATTIVAZIONE
            if (data === "preverifica") {
                state.tipo = "PREVERIFICA";
                state.step = "tipo"; // passo virtuale per validazione pulsanti
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

            // STEP ATTIVAZIONE
            else if (data === "attivazione") {

                // 🔒 CONTROLLO ACCESSO
                if (!AUTHORIZED_USERS.includes(chatId)) {
                    await sendTelegramMessage(
                        chatId,
                        "⛔ Non sei abilitato per questa operazione.\nContatta l'amministratore per l'accesso."
                    );
                    return;
                }

                state.tipo = "ATTIVAZIONE";
                state.step = "attivazione_cliente";

                await disableButton(callbackQuery.message.message_id, chatId, "attivazione");

                await sendTelegramMessage(chatId, "Inserisci il nome del cliente (COGNOME E NOME):");
            }

            // ===============================
            // ATTIVAZIONE - NOME CLIENTE
            // ===============================

            // STEP 2 - SCELTA AZIENDA
            else if (data === "comino_graziano" || data === "bf_impianti" || data === "cau_valentino" || data === "bono_impianti") {
                state.azienda = data;
                state.step = "cliente";
                await disableButton(callbackQuery.message.message_id, chatId, data);
                await sendTelegramMessage(chatId, "Inserisci il nome del cliente (COGNOME E NOME):");
            }

            // CONFERMA POSIZIONE
            else if (data === "posizione_si") {
                await axios.post(`${TELEGRAM_API}/sendMessage`, {
                    chat_id: chatId,
                    text: "Posizione confermata ✅",
                    reply_markup: { remove_keyboard: true }
                });

                state.step = "foto";
                state.fotoCount = 0;
                state.foto = [];

                await disableButton(callbackQuery.message.message_id, chatId, data);

                await sendTelegramMessage(chatId, "Perfetto. Inviami 3 foto 📸");
            }
            else if (data === "posizione_no") {
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

        // ================================
        // ATTIVAZIONE - INSERIMENTO NOME CLIENTE
        // ================================
        if (state.step === "attivazione_cliente" && text) {
            state.cliente = text.trim().toUpperCase();
            state.step = "attivazione_serial_ts";

            await sendTelegramMessage(
                chatId,
                "Inserisci il seriale TS:"
            );
            return;
        }

        if (state.step === "attivazione_serial_ts" && text) {

            const serialTS = text.trim().toUpperCase();
            state.serialTS = serialTS;

            // 🔥 controllo pattern
            if (serialTS.startsWith("322")) {

                const ok = await setLocazioneINST(serialTS);

                if (ok) {
                    await sendTelegramMessage(chatId, "✅ TS trovato e aggiornato a INST");
                } else {
                    await sendTelegramMessage(chatId, "⚠️ TS non trovato nel database");
                }

            } else {
                await sendTelegramMessage(chatId, "⚠️ Seriale TS non valido (deve iniziare con 322)");
            }

            state.step = "attivazione_mac_ts";

            await sendTelegramMessage(chatId, "Inserisci il MAC address TS:");
            return;
        }

        ///

        if (state.step === "attivazione_mac_ts" && text) {
            state.macTS = text.trim().toUpperCase();
            state.step = "attivazione_serial_poe";

            await sendTelegramMessage(
                chatId,
                "Inserisci il seriale POE:"
            );
            return;
        }

        if (state.step === "attivazione_serial_poe" && text) {

            const serialPOE = text.trim().toUpperCase();
            state.serialPOE = serialPOE;

            // 🔥 controllo pattern POE
            if (serialPOE.startsWith("PT")) {

                const ok = await setLocazioneINST(serialPOE);

                if (ok) {
                    await sendTelegramMessage(chatId, "✅ POE trovato e aggiornato a INST");
                } else {
                    await sendTelegramMessage(chatId, "⚠️ POE non trovato nel database");
                }

            } else {
                await sendTelegramMessage(chatId, "⚠️ Seriale POE non valido (deve iniziare con PT)");
            }

            state.step = "attivazione_foto";

            state.foto = [];
            state.fotoCount = 0;

            await sendTelegramMessage(chatId, "Perfetto. Inviami 4 foto 📸");
            return;
        }

        // ================================
        // PREVERIFICA - INSERIMENTO NOME CLIENTE
        // ================================
        if (state.step === "cliente" && text) {
            state.cliente = text.trim().toUpperCase();
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

        //AGGIUNTO DI MIO PER FOTO ATTIVAZIONE
        // FOTO - gestione corretta (no duplicati dimensioni)
        if (state.step === "attivazione_foto" && update.message.photo) {

            // Prendo SOLO la versione più grande della foto
            const photos = update.message.photo;
            const largestPhoto = photos[photos.length - 1];
            const fileId = largestPhoto.file_id;

            // 🔒 Evito duplicati
            if (!state.foto.includes(fileId)) {
                state.foto.push(fileId);
                state.fotoCount++;
            }

            if (state.fotoCount < 4) {
                await sendTelegramMessage(
                    chatId,
                    `Foto ${state.fotoCount} ricevuta ✅ Inviami la prossima.`
                );
            } else {

                // 🔒 CONTROLLO FINALE DATI
                const requiredFields = [
                    state.tipo,
                    state.cliente,
                    state.serialTS,
                    state.macTS,
                    state.serialPOE
                ];

                const hasUndefined = requiredFields.some(
                    value => value === undefined || value === null || value === ""
                );

                // Controllo anche che abbia 4 foto
                if (hasUndefined || !state.foto || state.foto.length < 4) {

                    await sendTelegramMessage(
                        chatId,
                        "❌ Hai sbagliato qualcosa, dati mancanti o foto insufficienti."
                    );

                    delete userStates[chatId];
                    return;
                }

                // ✅ SUCCESSO
                await sendTelegramMessage(
                    chatId,
                    "✅ Procedura completata con successo ATTIVAZIONE!"
                );

                // 🔥 Invio email
                await sendEmailWithDataAttivazione(state);
                console.log(state.cliente, state.tipo)

                // 🧹 Pulizia memoria
                delete userStates[chatId];
            }

            return;
        }
        //FINE AGGIUNTO DI MIO

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

app.get("/api/totoSpedizioni", async (req, res, next) => {
    const client = new MongoClient(connectionString);

    try {
        await client.connect();

        let collection = client.db(DBNAME).collection("spedizioni");

        // prendo tutte le spedizioni
        let spedizioni = await collection.find({}).toArray();

        // estraggo tutti i seriali e li metto in un unico array
        let tuttiSeriali = [];

        spedizioni.forEach(spedizione => {
            if (spedizione.seriali && Array.isArray(spedizione.seriali)) {
                tuttiSeriali.push(...spedizione.seriali);
            }
        });

        // restituisco array unico
        res.send(tuttiSeriali);

    } catch (err) {
        res.status(500).send(`Errore esecuzione query: ${err}`);
    } finally {
        client.close();
    }
});

app.post("/api/modificaSeriale", async (req, res) => {

    const { codice_seriale, locazione, note } = req.body;

    if (!codice_seriale) {
        return res.status(400).send("codice_seriale mancante");
    }

    const client = new MongoClient(connectionString);

    try {
        await client.connect();

        const collection = client.db("isifiber").collection("spedizioni");

        // aggiorna il documento che contiene quel seriale dentro l'array
        const result = await collection.updateOne(
            { "seriali.codice_seriale": codice_seriale },
            {
                $set: {
                    "seriali.$.locazione": locazione,
                    "seriali.$.note": note
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send("Seriale non trovato");
        }

        res.send({
            success: true,
            message: "Seriale aggiornato correttamente",
            result
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Errore server");
    } finally {
        await client.close();
    }
});

app.get("/api/filtroCerca", async (req, res) => {
    const client = new MongoClient(connectionString);

    try {
        await client.connect();

        const testo = (req.query.search as string || "").trim();
        const collection = client.db(DBNAME).collection("spedizioni");

        let query = {};

        if (testo !== "") {
            const regex = new RegExp(testo, "i");

            query = {
                seriali: {
                    $elemMatch: {
                        $or: [
                            { codice_seriale: regex },
                            { locazione: regex },
                            { articolo: regex },
                            { note: regex }
                        ]
                    }
                }
            };
        }

        const spedizioni = await collection.find(query).toArray();

        const regex = testo ? new RegExp(testo, "i") : null;

        const tuttiSeriali: any[] = [];

        spedizioni.forEach(spedizione => {
            if (!Array.isArray(spedizione.seriali)) return;

            spedizione.seriali.forEach(s => {
                if (
                    !regex ||
                    regex.test(s.codice_seriale || "") ||
                    regex.test(s.locazione || "") ||
                    regex.test(s.articolo || "") ||
                    regex.test(s.note || "")
                ) {
                    tuttiSeriali.push(s);
                }
            });
        });

        res.send(tuttiSeriali);

    } catch (err) {
        res.status(500).send(`Errore: ${err}`);
    } finally {
        await client.close();
    }
});

async function setLocazioneINST(seriale: string) {
    const client = new MongoClient(connectionString);

    try {
        await client.connect();

        const collection = client.db(DBNAME).collection("spedizioni");

        const result = await collection.updateOne(
            { "seriali.codice_seriale": seriale },
            {
                $set: {
                    "seriali.$.locazione": "INST"
                }
            }
        );

        return result.matchedCount > 0;

    } catch (err) {
        console.error("Errore update locazione:", err);
        return false;
    } finally {
        await client.close();
    }
}

function inviaRichiesta(method, url, parameters = {}) {
    let config = {
        "baseURL": "",
        "url": url,
        "method": method.toUpperCase(),
        "headers": {
            "Accept": "application/json",
        },
        "timeout": 15000,
        "responseType": "json",
    }

    console.log(config);

    if (parameters instanceof FormData) {
        config.headers["Content-Type"] = 'multipart/form-data;'
        config["data"] = parameters     // Accept FormData, File, Blob
    }
    else if (method.toUpperCase() == "GET") {
        config.headers["Content-Type"] = 'application/x-www-form-urlencoded;charset=utf-8'
        config["params"] = parameters
    }
    else {
        config.headers["Content-Type"] = 'application/json; charset=utf-8'
        config["data"] = parameters
    }
    return axios(config as any);
}

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




























