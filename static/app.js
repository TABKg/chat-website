const state = {
    users: [],
    currentUserId: "",
    selectedUserId: "",
    conversation: [],
    pollTimer: null,
    typingPollTimer: null,
    typingStopTimer: null,
    translatedMessages: {},
};

const els = {
    createUserForm: document.querySelector("#createUserForm"),
    usernameInput: document.querySelector("#usernameInput"),
    displayNameInput: document.querySelector("#displayNameInput"),
    currentUserSelect: document.querySelector("#currentUserSelect"),
    userSearchInput: document.querySelector("#userSearchInput"),
    userList: document.querySelector("#userList"),
    partnerAvatar: document.querySelector("#partnerAvatar"),
    chatPartnerName: document.querySelector("#chatPartnerName"),
    chatPartnerStatus: document.querySelector("#chatPartnerStatus"),
    notice: document.querySelector("#notice"),
    messageSearchInput: document.querySelector("#messageSearchInput"),
    clearMessageSearch: document.querySelector("#clearMessageSearch"),
    languageSelect: document.querySelector("#languageSelect"),
    suggestReplyButton: document.querySelector("#suggestReplyButton"),
    typingIndicator: document.querySelector("#typingIndicator"),
    chatWindow: document.querySelector("#chatWindow"),
    messageForm: document.querySelector("#messageForm"),
    imageInput: document.querySelector("#imageInput"),
    messageInput: document.querySelector("#messageInput"),
    themeToggle: document.querySelector("#themeToggle"),
};

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const detail = data?.detail || "Something went wrong.";
        throw new Error(Array.isArray(detail) ? detail[0]?.msg || detail : detail);
    }

    return data;
}

function showNotice(message, isError = false) {
    els.notice.textContent = message;
    els.notice.classList.toggle("error", isError);
    els.notice.hidden = false;
    window.clearTimeout(Number(els.notice.dataset.timeoutId));
    els.notice.dataset.timeoutId = window.setTimeout(() => {
        els.notice.hidden = true;
    }, 3500);
}

function initials(name = "CL") {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "CL";
    return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function formatTime(value) {
    return new Intl.DateTimeFormat([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
    }).format(new Date(value));
}

function selectedUser() {
    return state.users.find((user) => String(user.id) === String(state.selectedUserId));
}

function currentUser() {
    return state.users.find((user) => String(user.id) === String(state.currentUserId));
}

function setTheme(isDark) {
    document.body.classList.toggle("dark", isDark);
    els.themeToggle.textContent = isDark ? "☀️" : "🌙";
    localStorage.setItem("chatlite-theme", isDark ? "dark" : "light");
}

function renderCurrentUserSelect() {
    const previous = state.currentUserId;
    els.currentUserSelect.innerHTML = '<option value="">Select yourself</option>';

    state.users.forEach((user) => {
        const option = document.createElement("option");
        option.value = user.id;
        option.textContent = `${user.display_name} (@${user.username})`;
        els.currentUserSelect.appendChild(option);
    });

    if (state.users.some((user) => String(user.id) === String(previous))) {
        els.currentUserSelect.value = previous;
    } else {
        state.currentUserId = "";
    }
}

function renderUsers(users = state.users) {
    els.userList.innerHTML = "";
    const visibleUsers = users.filter((user) => String(user.id) !== String(state.currentUserId));

    if (!visibleUsers.length) {
        els.userList.innerHTML = '<div class="empty-state"><p>No users found.</p></div>';
        return;
    }

    visibleUsers.forEach((user) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `user-item ${String(user.id) === String(state.selectedUserId) ? "active" : ""}`;
        button.innerHTML = `
            <span class="avatar">${initials(user.display_name)}<span class="online-dot"></span></span>
            <span class="user-meta">
                <strong>${escapeHtml(user.display_name)}</strong>
                <span>@${escapeHtml(user.username)} · online</span>
            </span>
        `;
        button.addEventListener("click", () => selectPartner(user.id));
        els.userList.appendChild(button);
    });
}

function renderChatHeader() {
    const partner = selectedUser();
    if (!state.currentUserId) {
        els.chatPartnerName.textContent = "Select yourself";
        els.chatPartnerStatus.textContent = "Choose a current user before opening a conversation.";
        els.partnerAvatar.textContent = "CL";
        return;
    }
    if (!partner) {
        els.chatPartnerName.textContent = "Select a chat partner";
        els.chatPartnerStatus.textContent = "Pick a user from the sidebar to start chatting.";
        els.partnerAvatar.textContent = initials(currentUser()?.display_name || "CL");
        return;
    }

    els.chatPartnerName.textContent = partner.display_name;
    els.chatPartnerStatus.textContent = `@${partner.username} · online`;
    els.partnerAvatar.textContent = initials(partner.display_name);
}

function messageBody(message) {
    const image = message.image_url
        ? `<img class="message-image" src="${escapeHtml(message.image_url)}" alt="Uploaded chat image">`
        : "";
    const text = message.content
        ? `<p class="message-text">${escapeHtml(message.content)}</p>`
        : "";
    const translated = state.translatedMessages[message.id]
        ? `<p class="translated-text">${escapeHtml(state.translatedMessages[message.id])}</p>`
        : "";
    return `${image}${text}${translated}`;
}

function renderMessages(messages = state.conversation) {
    els.chatWindow.innerHTML = "";

    if (!state.currentUserId || !state.selectedUserId) {
        els.chatWindow.innerHTML = `
            <div class="empty-state">
                <h3>Welcome to ChatLite</h3>
                <p>Create two users, select yourself, then choose a chat partner to start messaging.</p>
            </div>
        `;
        return;
    }

    if (!messages.length) {
        els.chatWindow.innerHTML = `
            <div class="empty-state">
                <h3>No messages yet</h3>
                <p>Send the first message to start the conversation.</p>
            </div>
        `;
        return;
    }

    messages.forEach((message) => {
        const mine = String(message.sender_id) === String(state.currentUserId);
        const row = document.createElement("article");
        row.className = `message-row ${mine ? "mine" : "theirs"}`;
        row.innerHTML = `
            <div class="message-bubble">
                ${messageBody(message)}
                <div class="message-info">
                    <span>${formatTime(message.created_at)}</span>
                    ${message.edited_at ? "<span>edited</span>" : ""}
                </div>
                <div class="message-actions">
                    ${message.content ? `<button type="button" data-action="translate" data-id="${message.id}">Translate</button>` : ""}
                    ${mine ? `
                        <button type="button" data-action="edit" data-id="${message.id}">Edit</button>
                        <button type="button" class="delete-button" data-action="delete" data-id="${message.id}">Delete</button>
                    ` : ""}
                </div>
            </div>
        `;
        els.chatWindow.appendChild(row);
    });

    els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function loadUsers() {
    try {
        state.users = await api("/api/users");
        renderCurrentUserSelect();
        renderUsers();
        renderChatHeader();
    } catch (error) {
        showNotice(error.message, true);
    }
}

async function loadConversation(showErrors = true) {
    if (!state.currentUserId || !state.selectedUserId) {
        state.conversation = [];
        renderChatHeader();
        renderMessages();
        updateTypingIndicator(false);
        return;
    }

    try {
        state.conversation = await api(`/api/conversations/${state.currentUserId}/${state.selectedUserId}`);
        renderChatHeader();
        renderMessages();
    } catch (error) {
        if (showErrors) showNotice(error.message, true);
    }
}

function selectPartner(userId) {
    if (!state.currentUserId) {
        showNotice("Select your current user first.", true);
        return;
    }
    state.selectedUserId = String(userId);
    state.translatedMessages = {};
    els.messageSearchInput.value = "";
    renderUsers();
    loadConversation();
    pollTypingState();
}

function startPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(() => {
        if (state.currentUserId && state.selectedUserId && !els.messageSearchInput.value.trim()) {
            loadConversation(false);
        }
    }, 2000);

    if (state.typingPollTimer) window.clearInterval(state.typingPollTimer);
    state.typingPollTimer = window.setInterval(pollTypingState, 1000);
}

async function searchUsers() {
    try {
        const q = els.userSearchInput.value.trim();
        const users = q ? await api(`/api/users/search?q=${encodeURIComponent(q)}`) : state.users;
        renderUsers(users);
    } catch (error) {
        showNotice(error.message, true);
    }
}

async function searchMessages() {
    const q = els.messageSearchInput.value.trim();
    if (!q) {
        renderMessages();
        return;
    }
    if (!state.currentUserId || !state.selectedUserId) {
        showNotice("Select a conversation before searching messages.", true);
        return;
    }

    try {
        const matches = await api(`/api/messages/search?q=${encodeURIComponent(q)}`);
        const conversationMatches = matches.filter((message) => {
            const sender = String(message.sender_id);
            const receiver = String(message.receiver_id);
            return (
                (sender === String(state.currentUserId) && receiver === String(state.selectedUserId)) ||
                (sender === String(state.selectedUserId) && receiver === String(state.currentUserId))
            );
        });
        renderMessages(conversationMatches);
    } catch (error) {
        showNotice(error.message, true);
    }
}

async function uploadSelectedImage() {
    const file = els.imageInput.files[0];
    if (!file) return null;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
        throw new Error("Only JPG, PNG, WebP, or GIF images are allowed.");
    }
    if (file.size > 5 * 1024 * 1024) {
        throw new Error("Image must be 5 MB or smaller.");
    }

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.detail || "Image upload failed.");
    }
    return data.image_url;
}

async function sendTypingState(isTyping) {
    if (!state.currentUserId || !state.selectedUserId) return;
    try {
        await api("/api/typing", {
            method: "POST",
            body: JSON.stringify({
                sender_id: Number(state.currentUserId),
                receiver_id: Number(state.selectedUserId),
                is_typing: isTyping,
            }),
        });
    } catch {
        // Typing status is optional UI polish; keep chat usable if it fails.
    }
}

function updateTypingIndicator(isTyping) {
    const partner = selectedUser();
    if (isTyping && partner) {
        els.typingIndicator.textContent = `${partner.display_name} is typing...`;
        els.typingIndicator.hidden = false;
    } else {
        els.typingIndicator.hidden = true;
        els.typingIndicator.textContent = "";
    }
}

async function pollTypingState() {
    if (!state.currentUserId || !state.selectedUserId) {
        updateTypingIndicator(false);
        return;
    }
    try {
        const data = await api(
            `/api/typing/${state.currentUserId}/${state.selectedUserId}?viewer_id=${state.currentUserId}`,
        );
        updateTypingIndicator(data.is_typing);
    } catch {
        updateTypingIndicator(false);
    }
}

async function stopTypingSoon() {
    window.clearTimeout(state.typingStopTimer);
    state.typingStopTimer = window.setTimeout(() => sendTypingState(false), 1500);
}

els.createUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await api("/api/users", {
            method: "POST",
            body: JSON.stringify({
                username: els.usernameInput.value,
                display_name: els.displayNameInput.value,
            }),
        });
        els.createUserForm.reset();
        await loadUsers();
        showNotice("User created.");
    } catch (error) {
        showNotice(error.message, true);
    }
});

els.currentUserSelect.addEventListener("change", () => {
    state.currentUserId = els.currentUserSelect.value;
    if (String(state.selectedUserId) === String(state.currentUserId)) {
        state.selectedUserId = "";
    }
    state.translatedMessages = {};
    els.messageSearchInput.value = "";
    renderUsers();
    loadConversation();
});

els.userSearchInput.addEventListener("input", searchUsers);

els.messageSearchInput.addEventListener("input", searchMessages);

els.clearMessageSearch.addEventListener("click", () => {
    els.messageSearchInput.value = "";
    renderMessages();
});

els.suggestReplyButton.addEventListener("click", async () => {
    if (!state.currentUserId || !state.selectedUserId) {
        showNotice("Select a conversation before asking for a suggestion.", true);
        return;
    }

    const latestReceived = [...state.conversation]
        .reverse()
        .find((message) => String(message.sender_id) === String(state.selectedUserId) && message.content);
    if (!latestReceived) {
        showNotice("No received text message to suggest a reply for.", true);
        return;
    }

    try {
        const data = await api("/api/ai/suggest", {
            method: "POST",
            body: JSON.stringify({
                conversation: state.conversation,
                last_message: latestReceived.content,
            }),
        });
        els.messageInput.value = data.suggestion;
        showNotice("Suggested reply added.");
    } catch (error) {
        showNotice(error.message, true);
    }
});

els.messageInput.addEventListener("input", () => {
    sendTypingState(true);
    stopTypingSoon();
});

els.messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = els.messageInput.value.trim();
    const hasImage = Boolean(els.imageInput.files[0]);
    if (!state.currentUserId || !state.selectedUserId) {
        showNotice("Select yourself and a chat partner first.", true);
        return;
    }
    if (!content && !hasImage) {
        showNotice("Type a message or choose an image before sending.", true);
        return;
    }

    try {
        const imageUrl = await uploadSelectedImage();
        await api("/api/messages", {
            method: "POST",
            body: JSON.stringify({
                sender_id: Number(state.currentUserId),
                receiver_id: Number(state.selectedUserId),
                content,
                image_url: imageUrl,
                message_type: imageUrl ? "image" : "text",
            }),
        });
        await sendTypingState(false);
        els.messageInput.value = "";
        els.imageInput.value = "";
        els.messageSearchInput.value = "";
        await loadConversation();
    } catch (error) {
        showNotice(error.message, true);
    }
});

els.chatWindow.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    try {
        if (action === "translate") {
            const current = state.conversation.find((message) => String(message.id) === String(id));
            if (!current?.content) {
                showNotice("Only text messages can be translated.", true);
                return;
            }
            const target = els.languageSelect.value;
            const data = await api(
                `/api/translate?text=${encodeURIComponent(current.content)}&target=${encodeURIComponent(target)}&source=auto`,
            );
            state.translatedMessages[id] = data.translated_text;
            renderMessages();
            showNotice("Message translated.");
        }

        if (action === "edit") {
            const current = state.conversation.find((message) => String(message.id) === String(id));
            const content = window.prompt("Edit message:", current?.content || "");
            if (content === null) return;
            if (!content.trim()) {
                showNotice("Message content cannot be empty.", true);
                return;
            }
            await api(`/api/messages/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ content }),
            });
            showNotice("Message updated.");
        }

        if (action === "delete") {
            if (!window.confirm("Delete this message?")) return;
            await api(`/api/messages/${id}`, { method: "DELETE" });
            showNotice("Message deleted.");
        }

        await loadConversation();
    } catch (error) {
        showNotice(error.message, true);
    }
});

els.themeToggle.addEventListener("click", () => {
    setTheme(!document.body.classList.contains("dark"));
});

setTheme(localStorage.getItem("chatlite-theme") === "dark");
loadUsers();
renderMessages();
startPolling();
