import axios from 'axios';
import { ethers } from 'ethers';
import chalk from 'chalk';
import fs from 'fs';
import 'dotenv/config';

const log = (type, message) => {
    let symbol;
    switch (type) {
        case 'success':
            symbol = chalk.green('[+]');
            break;
        case 'error':
            symbol = chalk.red('[-]');
            break;
        case 'info':
        default:
            symbol = chalk.blue('[info]');
            break;
    }
    // Waktu (`time`) dihapus dari output console.log
    console.log(`${symbol} ${message}`);
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getRandomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// --- KONFIGURASI DARI .ENV ---
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TASK_DELAY = parseInt(process.env.DELAY_BETWEEN_TASKS_MS, 10) || 5000;
const MIN_GAMES = parseInt(process.env.MIN_GAMES, 10) || 1;
const MAX_GAMES = parseInt(process.env.MAX_GAMES, 10) || 2;
const MIN_CHATS = parseInt(process.env.MIN_CHATS, 10) || 1;
const MAX_CHATS = parseInt(process.env.MAX_CHATS, 10) || 2;

if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith('0x')) {
    log('error', 'PRIVATE_KEY tidak valid atau tidak ditemukan di file .env.');
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

// --- FUNGSI-FUNGSI UTAMA ---

async function login() {
    log('info', `Mencoba login untuk akun: ${address}`);
    try {
        const privyHeaders = { ...HEADERS, "Privy-App-Id": "cm7f00k5c02tibel0m4o9tdy1" };
        const nonceResponse = await axios.post(`${API_CONFIG.PRIVY_API}/api/v1/siwe/init`, { address }, { headers: privyHeaders });
        const nonce = nonceResponse.data.nonce;
        log('info', 'Berhasil mendapatkan Nonce.');
        await delay(TASK_DELAY);

        const issuedAt = new Date().toISOString();
        const message = `app.wardenprotocol.org wants you to sign in with your Ethereum account:\n${address}\n\nBy signing, you are proving you own this wallet and logging in. This does not initiate a transaction or cost any fees.\n\nURI: https://app.wardenprotocol.org\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}\nResources:\n- https://privy.io`;
        const signature = await wallet.signMessage(message);

        const payload = { message, signature, chainId: "eip155:1" };
        const authResponse = await axios.post(`${API_CONFIG.PRIVY_API}/api/v1/siwe/authenticate`, payload, { headers: privyHeaders });
        
        log('success', 'Login Berhasil!');
        return authResponse.data.token;
    } catch (error) {
        log('error', `Login Gagal: ${error.response ? error.response.status : error.message}`);
        return null;
    }
}

async function sendActivity(token, type, metadata) {
    const activityHeaders = { ...HEADERS, 'Authorization': `Bearer ${token}`};
    try {
        await axios.post(`${API_CONFIG.BASE_API}/tokens/activity`, { activityType: type, metadata }, { headers: activityHeaders });
        log('success', `Aktivitas ${type} berhasil.`);
    } catch (error) {
        if (error.response && error.response.data.message.includes('already recorded')) {
            log('info', `Aktivitas ${type} sudah dikerjakan hari ini.`);
        } else {
            log('error', `Aktivitas ${type} Gagal: ${error.response ? error.response.status : error.message}`);
        }
    }
}

async function doAiChat(token) {
    const agentsHeaders = { 
        ...HEADERS, 
        'Authorization': `Bearer ${token}`,
        'X-Api-Key': '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'
    };
    log('info', 'Memulai tugas AI Chat...');
    try {
        const threadResponse = await axios.post(`${API_CONFIG.AGENTS_API}/threads`, {}, { headers: agentsHeaders });
        const threadId = threadResponse.data.thread_id;
        log('info', 'Thread chat dimulai.');
        await delay(TASK_DELAY);
        
        const question = questions[Math.floor(Math.random() * questions.length)];
        log('info', `Mengirim pertanyaan: ${question}`);
        
        await sendActivity(token, 'CHAT_INTERACTION', { action: "user_chat", message_length: question.length });

    } catch (error) {
        log('error', `Tugas AI Chat Gagal: ${error.response ? error.response.status : error.message}`);
    }
}


// --- ALUR UTAMA ---

async function run() {
    log('info', 'Memulai Bot Otomatis Single-Account Warden (Mode Natural)');
    
    const token = await login();

    if (token) {
        await delay(TASK_DELAY);
        await sendActivity(token, 'LOGIN', { action: "user_login" });

        const gameCount = getRandomInt(MIN_GAMES, MAX_GAMES);
        log('info', `Akan bermain game sebanyak ${gameCount} kali.`);
        for (let i = 0; i < gameCount; i++) {
            await delay(TASK_DELAY);
            log('info', `Mencoba bermain game (${i + 1}/${gameCount})...`);
            await sendActivity(token, 'GAME_PLAY', { action: "user_game" });
        }

        const chatCount = getRandomInt(MIN_CHATS, MAX_CHATS);
        log('info', `Akan melakukan chat sebanyak ${chatCount} kali.`);
        for (let i = 0; i < chatCount; i++) {
            await delay(TASK_DELAY);
            log('info', `Memulai sesi chat (${i + 1}/${chatCount})...`);
            await doAiChat(token);
        }
    }

    log('info', 'Semua tugas untuk hari ini selesai.');
}

run();
