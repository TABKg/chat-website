const state = {
    users: [],
    currentUserId: "",
    selectedUserId: "",
    conversation: [],
    pollTimer: null,
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
    chatWindow: document.querySelector("#chatWindow"),
    messageForm: document.querySelector("#messageForm"),
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
    window.clearTimeout(els.notice.dataset.timeoutId);
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
                <p class="message-text">${escapeHtml(message.content)}</p>
                <div class="message-info">
                    <span>${formatTime(message.created_at)}</span>
                    ${message.edited_at ? "<span>edited</span>" : ""}
                </div>
                ${mine ? `
                    <div class="message-actions">
                        <button type="button" data-action="edit" data-id="${message.id}">Edit</button>
                        <button type="button" class="delete-button" data-action="delete" data-id="${message.id}">Delete</button>
                    </div>
                ` : ""}
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
    renderUsers();
    loadConversation();
}

function startPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(() => {
        if (state.currentUserId && state.selectedUserId && !els.messageSearchInput.value.trim()) {
            loadConversation(false);
        }
    }, 2000);
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

els.messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = els.messageInput.value.trim();
    if (!state.currentUserId || !state.selectedUserId) {
        showNotice("Select yourself and a chat partner first.", true);
        return;
    }
    if (!content) {
        showNotice("Type a message before sending.", true);
        return;
    }

    try {
        await api("/api/messages", {
            method: "POST",
            body: JSON.stringify({
                sender_id: Number(state.currentUserId),
                receiver_id: Number(state.selectedUserId),
                content,
            }),
        });
        els.messageInput.value = "";
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
