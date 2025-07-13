// auto-single.js
// Script super-simple, 100% otomatis untuk 1 akun.
import axios from 'axios';
import { ethers } from 'ethers';
import chalk from 'chalk';
import fs from 'fs';
import moment from 'moment-timezone';
import 'dotenv/config'; // Langsung load .env

const log = (message) => {
    const time = chalk.cyan(`[ ${moment().tz('Asia/Jakarta').format('HH:mm:ss')} ]`);
    console.log(`${time} ${chalk.white('|')} ${message}`);
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- KONFIGURASI ---
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TASK_DELAY = parseInt(process.env.DELAY_BETWEEN_TASKS_MS, 10) || 3000;

if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith('0x')) {
    log(chalk.red('PRIVATE_KEY tidak valid atau tidak ditemukan di file .env.'));
    process.exit(1);
}

const wallet = new ethers.Wallet(PRIVATE_KEY);
const address = wallet.address;
const questions = JSON.parse(fs.readFileSync('question_lists.json', 'utf-8'));

const API_CONFIG = {
    PRIVY_API: "https://auth.privy.io",
    BASE_API: "https://api.app.wardenprotocol.org/api",
    AGENTS_API: "https://warden-app-agents-prod-new-d1025b697dc25df9a5654bc047bbe875.us.langgraph.app",
};

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin': 'https://app.wardenprotocol.org',
    'Referer': 'https://app.wardenprotocol.org/',
};

// --- ALUR UTAMA ---

async function login() {
    log(chalk.blue(`Mencoba login untuk akun: ${address}`));
    try {
        const privyHeaders = { ...HEADERS, "Privy-App-Id": "cm7f00k5c02tibel0m4o9tdy1" };
        
        // 1. Dapatkan Nonce
        const nonceResponse = await axios.post(`${API_CONFIG.PRIVY_API}/api/v1/siwe/init`, { address }, { headers: privyHeaders });
        const nonce = nonceResponse.data.nonce;
        log('Berhasil mendapatkan Nonce.');
        await delay(TASK_DELAY);

        // 2. Tandatangani Pesan & Autentikasi
        const issuedAt = new Date().toISOString();
        const message = `app.wardenprotocol.org wants you to sign in with your Ethereum account:\n${address}\n\nBy signing, you are proving you own this wallet and logging in. This does not initiate a transaction or cost any fees.\n\nURI: https://app.wardenprotocol.org\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}\nResources:\n- https://privy.io`;
        const signature = await wallet.signMessage(message);

        const payload = { message, signature, chainId: "eip155:1" };
        const authResponse = await axios.post(`${API_CONFIG.PRIVY_API}/api/v1/siwe/authenticate`, payload, { headers: privyHeaders });
        
        log(chalk.green('Login Berhasil!'));
        return authResponse.data.token; // Kembalikan token akses

    } catch (error) {
        log(chalk.red(`Login Gagal: ${error.response ? error.response.status : error.message}`));
        return null;
    }
}

async function sendActivity(token, type, metadata) {
    const activityHeaders = { ...HEADERS, 'Authorization': `Bearer ${token}`};
    try {
        await axios.post(`${API_CONFIG.BASE_API}/tokens/activity`, { activityType: type, metadata }, { headers: activityHeaders });
        log(chalk.green(`Aktivitas ${type}: Berhasil.`));
    } catch (error) {
        if (error.response && error.response.data.message.includes('already recorded')) {
            log(chalk.yellow(`Aktivitas ${type}: Sudah dikerjakan hari ini.`));
        } else {
            log(chalk.red(`Aktivitas ${type} Gagal: ${error.response ? error.response.status : error.message}`));
        }
    }
}

async function doAiChat(token) {
    const agentsHeaders = { 
        ...HEADERS, 
        'Authorization': `Bearer ${token}`,
        'X-Api-Key': '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'
    };
    log('Memulai tugas AI Chat...');
    try {
        // 1. Start Thread
        const threadResponse = await axios.post(`${API_CONFIG.AGENTS_API}/threads`, {}, { headers: agentsHeaders });
        const threadId = threadResponse.data.thread_id;
        log('Thread chat dimulai...');
        await delay(TASK_DELAY);

        // 2. Kirim Pertanyaan (tanpa streaming, untuk simplifikasi)
        const question = questions[Math.floor(Math.random() * questions.length)];
        log(`Mengirim pertanyaan: ${chalk.blue(question)}`);
        const chatPayload = { input: { messages: [{ type: "human", content: question }] } };
        // Untuk mendapatkan respons, kita perlu memanggil endpoint stream, tapi kita akan skip parsingnya untuk simplifikasi
        // dan langsung submit activity. Jika ingin responsnya, logika stream harus ditambahkan lagi.
        
        // 3. Submit Aktivitas Chat
        await sendActivity(token, 'CHAT_INTERACTION', { action: "user_chat", message_length: question.length });

    } catch (error) {
        log(chalk.red(`Tugas AI Chat Gagal: ${error.response ? error.response.status : error.message}`));
    }
}


async function run() {
    log(chalk.yellow('--- Memulai Bot Otomatis Single-Account Warden ---'));
    
    const token = await login();

    if (token) {
        // Lakukan semua tugas setelah login berhasil
        await delay(TASK_DELAY);
        await sendActivity(token, 'LOGIN', { action: "user_login" });
        
        await delay(TASK_DELAY);
        await sendActivity(token, 'GAME_PLAY', { action: "user_game" });

        await delay(TASK_DELAY);
        await doAiChat(token);
    }

    log(chalk.yellow('--- Semua tugas untuk hari ini selesai. ---'));
}

run();
