const API = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}`;

let files = [];

let lastUpdateId =
    Number(localStorage.getItem("telegram_last_update")) || 0;


/* =========================
   TELEGRAM API
========================= */

async function telegram(method, data = {}) {

    try {

        const response = await fetch(`${API}/${method}`, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(data)
        });

        return await response.json();

    } catch (error) {

        console.error("Telegram error:", error);

        return {
            ok: false,
            error: error
        };
    }
}


/* =========================
   GET TELEGRAM UPDATES
========================= */

async function checkTelegram() {

    const result = await telegram("getUpdates", {

        offset: lastUpdateId + 1,

        timeout: 1,

        allowed_updates: ["message"]

    });


    if (!result.ok) {

        setStatus(false);

        return;
    }


    setStatus(true);


    if (!result.result) return;


    for (const update of result.result) {

        lastUpdateId = update.update_id;

        localStorage.setItem(
            "telegram_last_update",
            lastUpdateId
        );

        processUpdate(update);
    }
}


/* =========================
   PROCESS UPDATE
========================= */

function processUpdate(update) {

    const message = update.message;

    if (!message) return;


    /* Only accept files from ADMIN */

    if (
        String(message.chat.id) !==
        String(CONFIG.ADMIN_CHAT_ID)
    ) {
        return;
    }


    /* DOCUMENT */

    if (message.document) {

        addTelegramFile(
            message.document,
            message.caption || ""
        );

        return;
    }


    /* PHOTO */

    if (message.photo) {

        const photo =
            message.photo[message.photo.length - 1];

        addTelegramPhoto(
            photo,
            message.caption || ""
        );

        return;
    }


    /* COMMANDS */

    if (message.text) {

        handleCommand(message.text);
    }
}


/* =========================
   ADD DOCUMENT
========================= */

function addTelegramFile(document, caption) {

    const file = {

        id: document.file_id,

        type: "document",

        name: document.file_name || "file",

        size: document.file_size || 0,

        caption: caption,

        date: Date.now()

    };


    /*
       Prevent duplicates
    */

    const exists = files.some(
        item => item.id === file.id
    );


    if (!exists) {

        files.unshift(file);

        if (files.length > CONFIG.MAX_FILES) {

            files =
                files.slice(0, CONFIG.MAX_FILES);
        }

        saveFiles();

        renderFiles();
    }
}


/* =========================
   ADD PHOTO
========================= */

function addTelegramPhoto(photo, caption) {

    const file = {

        id: photo.file_id,

        type: "photo",

        name: caption || "Image",

        size: 0,

        caption: caption,

        date: Date.now()

    };


    const exists = files.some(
        item => item.id === file.id
    );


    if (!exists) {

        files.unshift(file);

        saveFiles();

        renderFiles();
    }
}


/* =========================
   COMMANDS
========================= */

function handleCommand(text) {

    const command =
        text.trim().split(" ")[0].toLowerCase();


    if (command === "/clear") {

        files = [];

        saveFiles();

        renderFiles();
    }


    if (command === "/refresh") {

        renderFiles();
    }
}


/* =========================
   GET TELEGRAM FILE URL
========================= */

async function getDownloadUrl(fileId) {

    const result =
        await telegram("getFile", {
            file_id: fileId
        });


    if (!result.ok) {

        return null;
    }


    const path =
        result.result.file_path;


    return `https://api.telegram.org/file/bot${CONFIG.BOT_TOKEN}/${path}`;
}


/* =========================
   DOWNLOAD
========================= */

async function downloadFile(fileId, fileName) {

    const url =
        await getDownloadUrl(fileId);


    if (!url) {

        alert("تعذر الحصول على الملف");

        return;
    }


    const link =
        document.createElement("a");


    link.href = url;

    link.download = fileName;

    link.target = "_blank";

    document.body.appendChild(link);

    link.click();

    link.remove();
}


/* =========================
   RENDER
========================= */

function renderFiles() {

    const container =
        document.getElementById("filesContainer");

    const empty =
        document.getElementById("empty");

    const loading =
        document.getElementById("loading");


    loading.classList.add("hidden");


    const search =
        document.getElementById("searchInput")
        .value
        .toLowerCase();


    const filtered =
        files.filter(file =>
            file.name
                .toLowerCase()
                .includes(search)
        );


    container.innerHTML = "";


    if (filtered.length === 0) {

        empty.classList.remove("hidden");

        return;

    } else {

        empty.classList.add("hidden");
    }


    filtered.forEach(file => {

        const card =
            document.createElement("div");

        card.className = "fileCard";


        const icon =
            file.type === "photo"
                ? "🖼️"
                : getFileIcon(file.name);


        card.innerHTML = `

            <div class="fileIcon">
                ${icon}
            </div>

            <div class="fileName">
                ${escapeHTML(file.name)}
            </div>

            <div class="fileInfo">
                ${formatSize(file.size)}
            </div>

            <a
                href="#"
                class="downloadBtn"
                data-id="${file.id}"
            >
                📥 تحميل
            </a>

        `;


        const button =
            card.querySelector(".downloadBtn");


        button.addEventListener(
            "click",
            async function(event) {

                event.preventDefault();

                button.textContent =
                    "⏳ جاري التحضير...";

                await downloadFile(
                    file.id,
                    file.name
                );

                button.textContent =
                    "📥 تحميل";
            }
        );


        container.appendChild(card);
    });
}


/* =========================
   FILE ICON
========================= */

function getFileIcon(name) {

    const extension =
        name
            .split(".")
            .pop()
            .toLowerCase();


    const icons = {

        zip: "🗜️",
        rar: "🗜️",
        "7z": "🗜️",

        apk: "📱",

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

        txt: "📄",

        doc: "📝",
        docx: "📝",

        xls: "📊",
        xlsx: "📊"

    };


    return icons[extension] || "📄";
}


/* =========================
   FORMAT SIZE
========================= */

function formatSize(bytes) {

    if (!bytes) return "حجم غير معروف";


    const units =
        ["B", "KB", "MB", "GB", "TB"];


    const i =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    return (
        (bytes / Math.pow(1024, i))
            .toFixed(2)
        + " "
        + units[i]
    );
}


/* =========================
   STORAGE
========================= */

function saveFiles() {

    localStorage.setItem(
        "filebox_files",
        JSON.stringify(files)
    );
}


function loadFiles() {

    try {

        const saved =
            localStorage.getItem(
                "filebox_files"
            );


        if (saved) {

            files =
                JSON.parse(saved);
        }

    } catch (error) {

        files = [];
    }
}


/* =========================
   SEARCH
========================= */

document
    .getElementById("searchInput")
    .addEventListener(
        "input",
        renderFiles
    );


/* =========================
   REFRESH
========================= */

document
    .getElementById("refreshBtn")
    .addEventListener(
        "click",
        checkTelegram
    );


/* =========================
   STATUS
========================= */

function setStatus(online) {

    const dot =
        document.getElementById("statusDot");

    const text =
        document.getElementById("statusText");


    if (online) {

        dot.style.background =
            "#22c55e";

        text.textContent =
            "متصل بـ Telegram";

    } else {

        dot.style.background =
            "#ef4444";

        text.textContent =
            "خطأ في الاتصال";
    }
}


/* =========================
   SECURITY
========================= */

function escapeHTML(text) {

    const div =
        document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
}


/* =========================
   START
========================= */

loadFiles();

renderFiles();

checkTelegram();


setInterval(
    checkTelegram,
    CONFIG.POLLING_INTERVAL
);