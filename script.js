/*
 FileBox Static Demo
 - Telegram Bot API is called directly from the browser.
 - Only the configured ADMIN_CHAT_ID can add/delete files.
 - Files are stored in localStorage in this browser.
 - Keep this page open for Telegram polling in the demo.
*/

const API = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}`;
const STORAGE_KEY = "filebox_demo_files";
const OFFSET_KEY = "filebox_demo_update_offset";

let files = loadFiles();
let polling = false;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("siteName").textContent = CONFIG.SITE_NAME;
    document.getElementById("footerName").textContent = CONFIG.SITE_NAME;

    document.getElementById("searchInput").addEventListener("input", renderFiles);

    document.getElementById("refreshBtn").addEventListener("click", () => {
        checkTelegram(true);
    });

    renderFiles();
    checkTelegram(true);

    setInterval(() => checkTelegram(false), CONFIG.POLL_INTERVAL);
});


async function tg(method, body = {}) {
    const response = await fetch(`${API}/${method}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    return response.json();
}


async function checkTelegram(showMessage) {
    if (!CONFIG.BOT_TOKEN || CONFIG.BOT_TOKEN.includes("PUT_YOUR")) {
        setStatus("error", "ضع Bot Token في config.js");
        return;
    }

    if (polling) return;

    polling = true;
    setStatus("loading", "جاري الاتصال...");

    try {
        const offset = Number(
            localStorage.getItem(OFFSET_KEY) || 0
        );

        const result = await tg("getUpdates", {
            offset: offset + 1,
            timeout: 1,
            allowed_updates: [
                "message",
                "callback_query"
            ]
        });

        if (!result.ok) {
            if (result.error_code === 409) {
                throw new Error(
                    "البوت عندو Webhook مفعل. خاصك تحيد Webhook باش getUpdates يخدم."
                );
            }

            throw new Error(
                result.description || "Telegram API error"
            );
        }

        for (const update of result.result || []) {
            localStorage.setItem(
                OFFSET_KEY,
                update.update_id
            );

            await processUpdate(update);
        }

        setStatus("online", "متصل");

        if (
            showMessage &&
            (result.result || []).length
        ) {
            showNotice(
                "تم تحديث البيانات من Telegram."
            );
        }

    } catch (err) {
        console.error(err);

        setStatus(
            "error",
            "تعذر الاتصال"
        );

        if (showMessage) {
            showNotice(
                "تعذر الاتصال بـ Telegram. تحقق من التوكن والاتصال."
            );
        }

    } finally {
        polling = false;
    }
}


async function processUpdate(update) {

    // Telegram button
    if (update.callback_query) {
        await handleCallback(
            update.callback_query
        );
        return;
    }

    const msg = update.message;

    if (!msg) return;

    // Only admin can control the site
    if (
        String(msg.chat.id) !==
        String(CONFIG.ADMIN_CHAT_ID)
    ) {
        return;
    }

    // Commands
    if (msg.text) {
        await handleCommand(
            msg.text.trim()
        );
    }

    // File received
    if (msg.document) {

        addDocument(
            msg.document,
            msg.caption || ""
        );

        await sendBotMessage(
            msg.chat.id,

            `✅ تمت إضافة الملف للموقع:\n${msg.document.file_name || "file"}`,

            mainKeyboard()
        );
    }
}


async function handleCommand(text) {

    const command =
        text.split(/\s+/)[0].toLowerCase();

    if (
        command === "/start" ||
        command === "/menu"
    ) {

        await sendBotMessage(
            CONFIG.ADMIN_CHAT_ID,
            "🤖 لوحة تحكم RH_FileBox",
            mainKeyboard()
        );

        return;
    }


    if (command === "/clear") {

        files = [];

        saveFiles();

        renderFiles();

        await sendBotMessage(
            CONFIG.ADMIN_CHAT_ID,
            "🗑️ تم حذف جميع الملفات من هذا المتصفح.",
            mainKeyboard()
        );
    }
}


function mainKeyboard() {

    return {
        inline_keyboard: [

            [
                {
                    text: "📤 إضافة ملف",
                    callback_data: "add_file"
                }
            ],

            [
                {
                    text: "📂 ملفات الموقع",
                    callback_data: "list_files"
                }
            ],

            [
                {
                    text: "📊 الإحصائيات",
                    callback_data: "stats"
                }
            ]

        ]
    };
}


async function handleCallback(query) {

    if (
        String(query.message?.chat?.id) !==
        String(CONFIG.ADMIN_CHAT_ID)
    ) {

        await answerCallback(
            query.id,
            "غير مصرح."
        );

        return;
    }

    await answerCallback(query.id);

    const data = query.data || "";


    // إضافة ملف
    if (data === "add_file") {

        await editBotMessage(

            query.message,

            "📤 <b>إضافة ملف</b>\n\n" +
            "صيفط دابا الملف للبوت، " +
            "والموقع المفتوح غادي يلتقطو تلقائياً.",

            backKeyboard()
        );

        return;
    }


    // ملفات الموقع
    if (data === "list_files") {

        await showFilesInBot(
            query.message.chat.id,
            query.message.message_id
        );

        return;
    }


    // الإحصائيات
    if (data === "stats") {

        const total = files.length;

        const size = files.reduce(
            (sum, f) =>
                sum + Number(f.size || 0),
            0
        );

        await editBotMessage(

            query.message,

            `📊 <b>إحصائيات</b>\n\n` +
            `عدد الملفات: ${total}\n` +
            `الحجم الإجمالي: ${formatSize(size)}`,

            backKeyboard()
        );

        return;
    }


    // رجوع
    if (data === "back") {

        await editBotMessage(
            query.message,
            "🤖 لوحة تحكم RH_FileBox",
            mainKeyboard()
        );

        return;
    }


    // تأكيد الحذف
    if (data.startsWith("confirm_delete:")) {

        // نستعمل key قصير بدل Telegram file_id
        const key = data.slice(
            "confirm_delete:".length
        );

        const file = files.find(
            f => f.key === key
        );

        if (!file) {

            await editBotMessage(
                query.message,
                "⚠️ الملف غير موجود.",
                listBackKeyboard()
            );

            return;
        }


        await editBotMessage(

            query.message,

            `⚠️ واش متأكد بغيتي تحذف؟\n\n` +
            `📄 <b>${escapeTelegram(file.name)}</b>`,

            {
                inline_keyboard: [

                    [
                        {
                            text: "✅ نعم، حذف",
                            callback_data:
                                `delete:${file.key}`
                        }
                    ],

                    [
                        {
                            text: "❌ إلغاء",
                            callback_data:
                                "list_files"
                        }
                    ]

                ]
            }
        );

        return;
    }


    // حذف الملف
    if (data.startsWith("delete:")) {

        // نستعمل key قصير
        const key = data.slice(
            "delete:".length
        );

        const file = files.find(
            f => f.key === key
        );

        if (!file) {

            await editBotMessage(
                query.message,
                "⚠️ الملف غير موجود.",
                listBackKeyboard()
            );

            return;
        }


        files = files.filter(
            f => f.key !== key
        );

        saveFiles();

        renderFiles();


        await editBotMessage(

            query.message,

            `🗑️ تم حذف:\n` +
            `<b>${escapeTelegram(file.name)}</b>`,

            listBackKeyboard()
        );

        return;
    }
}


async function showFilesInBot(
    chatId,
    messageId
) {

    // ما كاين حتى ملف
    if (!files.length) {

        await editBotMessage(

            {
                chat: {
                    id: chatId
                },
                message_id: messageId
            },

            "📂 <b>ملفات الموقع</b>\n\n" +
            "لا توجد ملفات في هذا المتصفح.",

            backKeyboard()
        );

        return;
    }


    // إنشاء أزرار الملفات
    // key قصير باش ما نتجاوزوش 64 character ديال Telegram
    const buttons =
        files
            .slice(0, CONFIG.MAX_FILES)
            .map(file => [

                {
                    text:
                        `🗑️ ${shortName(file.name)}`,

                    callback_data:
                        `confirm_delete:${file.key}`
                }

            ]);


    buttons.push([
        {
            text: "🔄 تحديث",
            callback_data: "list_files"
        }
    ]);


    buttons.push([
        {
            text: "⬅️ رجوع",
            callback_data: "back"
        }
    ]);


    await editBotMessage(

        {
            chat: {
                id: chatId
            },
            message_id: messageId
        },

        `📂 <b>ملفات الموقع</b>\n\n` +
        `عدد الملفات: ${files.length}\n` +
        `اضغط على زر الملف لحذفه.`,

        {
            inline_keyboard: buttons
        }
    );
}


function backKeyboard() {

    return {
        inline_keyboard: [
            [
                {
                    text: "⬅️ رجوع",
                    callback_data: "back"
                }
            ]
        ]
    };
}


function listBackKeyboard() {

    return {
        inline_keyboard: [

            [
                {
                    text: "📂 ملفات الموقع",
                    callback_data: "list_files"
                }
            ],

            [
                {
                    text: "⬅️ رجوع",
                    callback_data: "back"
                }
            ]

        ]
    };
}


async function sendBotMessage(
    chatId,
    text,
    keyboard
) {

    return tg(
        "sendMessage",
        {
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            reply_markup: keyboard
        }
    );
}


async function editBotMessage(
    message,
    text,
    keyboard
) {

    return tg(
        "editMessageText",
        {
            chat_id:
                message.chat.id,

            message_id:
                message.message_id,

            text,

            parse_mode: "HTML",

            reply_markup:
                keyboard
        }
    );
}


async function answerCallback(
    id,
    text = ""
) {

    return tg(
        "answerCallbackQuery",
        {
            callback_query_id: id,
            text
        }
    );
}


function addDocument(
    document,
    caption
) {

    const file = {

        // ID قصير خاص بالموقع
        key: makeFileKey(),

        // Telegram file ID
        id: document.file_id,

        name:
            document.file_name ||
            "file",

        size:
            Number(
                document.file_size || 0
            ),

        telegramFileId:
            document.file_id,

        caption,

        addedAt:
            Date.now()
    };


    // منع تكرار نفس الملف
    if (
        files.some(
            f =>
                f.id === file.id
        )
    ) {
        return;
    }


    files.unshift(file);

    files =
        files.slice(
            0,
            CONFIG.MAX_FILES
        );

    saveFiles();

    renderFiles();
}


// إنشاء ID قصير
function makeFileKey() {

    return (
        "f" +
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .slice(2, 7)
    );
}


async function getTelegramFileUrl(
    fileId
) {

    const result =
        await tg(
            "getFile",
            {
                file_id: fileId
            }
        );


    if (!result.ok) {

        throw new Error(
            result.description ||
            "getFile failed"
        );
    }


    return (
        `https://api.telegram.org/file/bot` +
        `${CONFIG.BOT_TOKEN}/` +
        `${result.result.file_path}`
    );
}


async function downloadFile(file) {

    try {

        const url =
            await getTelegramFileUrl(
                file.telegramFileId
            );

        window.open(
            url,
            "_blank",
            "noopener"
        );

    } catch (err) {

        console.error(err);

        showNotice(
            "تعذر تجهيز رابط التحميل."
        );
    }
}


function renderFiles() {

    const container =
        document.getElementById(
            "filesContainer"
        );

    const empty =
        document.getElementById(
            "empty"
        );

    const loading =
        document.getElementById(
            "loading"
        );

    const query =
        document
            .getElementById(
                "searchInput"
            )
            .value
            .toLowerCase()
            .trim();


    loading.classList.add(
        "hidden"
    );

    container.innerHTML = "";


    const filtered =
        files.filter(
            f =>
                f.name
                    .toLowerCase()
                    .includes(query)
        );


    if (!filtered.length) {

        empty.classList.remove(
            "hidden"
        );

        return;
    }


    empty.classList.add(
        "hidden"
    );


    filtered.forEach(file => {

        const card =
            document.createElement(
                "article"
            );

        card.className =
            "fileCard";


        const icon =
            document.createElement(
                "div"
            );

        icon.className =
            "fileIcon";

        icon.textContent =
            getFileIcon(
                file.name
            );


        const name =
            document.createElement(
                "div"
            );

        name.className =
            "fileName";

        name.textContent =
            file.name;


        const info =
            document.createElement(
                "div"
            );

        info.className =
            "fileInfo";

        info.textContent =
            `${formatSize(file.size)} • ` +
            `${formatDate(file.addedAt)}`;


        const btn =
            document.createElement(
                "a"
            );

        btn.className =
            "downloadBtn";

        btn.href = "#";

        btn.textContent =
            "📥 تحميل";


        btn.addEventListener(
            "click",
            e => {

                e.preventDefault();

                downloadFile(file);
            }
        );


        card.append(
            icon,
            name,
            info,
            btn
        );

        container.appendChild(
            card
        );
    });
}


function loadFiles() {

    try {

        const stored =
            JSON.parse(
                localStorage.getItem(
                    STORAGE_KEY
                ) || "[]"
            );


        let changed = false;


        // الملفات القديمة التي ما عندهاش key
        const result =
            stored.map(file => {

                if (!file.key) {

                    changed = true;

                    return {
                        ...file,
                        key: makeFileKey()
                    };
                }

                return file;
            });


        if (changed) {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(result)
            );
        }


        return result;

    } catch {

        return [];
    }
}


function saveFiles() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(files)
    );
}


function setStatus(
    type,
    text
) {

    const dot =
        document.getElementById(
            "statusDot"
        );

    const label =
        document.getElementById(
            "statusText"
        );


    dot.style.background =
        type === "online"
            ? "#22c55e"
            : type === "loading"
            ? "#f59e0b"
            : "#ef4444";


    label.textContent =
        text;
}


function showNotice(text) {

    const el =
        document.getElementById(
            "notice"
        );


    el.textContent =
        text;

    el.classList.remove(
        "hidden"
    );


    clearTimeout(
        showNotice.timer
    );


    showNotice.timer =
        setTimeout(
            () =>
                el.classList.add(
                    "hidden"
                ),
            3500
        );
}


function formatSize(bytes) {

    if (!bytes)
        return "حجم غير معروف";


    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];


    const i =
        Math.min(
            Math.floor(
                Math.log(bytes) /
                Math.log(1024)
            ),
            units.length - 1
        );


    return (
        `${(
            bytes /
            Math.pow(1024, i)
        ).toFixed(2)} ${units[i]}`
    );
}


function formatDate(ms) {

    if (!ms)
        return "بدون تاريخ";


    return new Date(ms)
        .toLocaleDateString(
            "ar-MA"
        );
}


function getFileIcon(name) {

    const ext =
        name
            .split(".")
            .pop()
            .toLowerCase();


    const icons = {

        apk: "📱",

        zip: "🗜️",
        rar: "🗜️",
        "7z": "🗜️",

        exe: "💻",

        iso: "💿",

        mp4: "🎬",
        mkv: "🎬",
        avi: "🎬",

        mp3: "🎵",

        pdf: "📕",

        jpg: "🖼️",
        jpeg: "🖼️",
        png: "🖼️",
        webp: "🖼️",

        doc: "📝",
        docx: "📝",

        xls: "📊",
        xlsx: "📊"
    };


    return (
        icons[ext] ||
        "📄"
    );
}


function shortName(name) {

    return name.length > 28
        ? name.slice(0, 25) + "..."
        : name;
}


function escapeTelegram(text) {

    return String(text)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        );
}
