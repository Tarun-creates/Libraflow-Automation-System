
let currentFilter = 'all';
let searchTerm = '';
let currentPage = 1;
let totalPages = 1;
let sortBy = 'title';
let sortOrder = 'asc';
let memberPage = 1;
let memberTotalPages = 1;
let memberSearch = '';
let isAdmin = false;

let dropdownLoading = false;

let memberSelectListenerAdded = false;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAdminStatus();
  loadStatistics();
  loadBooks();
  loadMembers();
  renderCharts();
  refreshIssuableDropdowns();
});

async function checkAdminStatus() {
  try {
    const res = await fetch('/check_admin');
    const data = await res.json();
    isAdmin = data.is_admin;
    updateAdminUI();
  } catch (err) {
    console.error('Failed to check admin status', err);
    isAdmin = false;
    updateAdminUI();
  }
}

function updateAdminUI() {
  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    if (isAdmin) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });

  const adminBtn = document.querySelector('.btn.btn-secondary[onclick*="adminLoginModal"]');
  if (adminBtn) {
    if (isAdmin) {
      adminBtn.textContent = 'Logout';
      adminBtn.onclick = () => adminLogout();
    } else {
      adminBtn.textContent = 'Admin';
      adminBtn.onclick = () => openModal('adminLoginModal');
    }
  }
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = saved === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', next);
}

function showNotification(msg, type = 'success') {
  const note = document.getElementById('notification');
  if (!note) return;
  note.textContent = msg;
  note.className = `notification ${type} show`;
  setTimeout(() => note.classList.remove('show'), 3000);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');

  if (id === 'issueBookModal' || id === 'returnBookModal') {
    refreshIssuableDropdowns().catch(err => console.error('refreshIssuableDropdowns failed', err));
  }
}

function closeModal(id) { const el = document.getElementById(id); if(el) el.classList.remove('active'); }
function escapeHtml(s) { if (!s && s !== 0) return ''; return String(s).replace(/[&<>"']/g, function (m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]; }); }
function jsonEscape(str) { if (str === null || str === undefined) return "''"; return `'${String(str).replace(/'/g, "\\'").replace(/\n/g, ' ')}'`; }

function openIssueBookModal() {
  if (!isAdmin) {
    showNotification('Admin login required', 'error');
    return;
  }
  openModal('issueBookModal');
  if (typeof refreshIssuableDropdowns === 'function') {
    refreshIssuableDropdowns().catch(err => console.error('refreshIssuableDropdowns failed', err));
  } else {
    console.warn('refreshIssuableDropdowns not found');
  }
}

async function loadStatistics() {
  try {
    console.log('Loading statistics...');
    const response = await fetch(`/get_statistics?ts=${Date.now()}`, { cache: 'no-store' });
    console.log('Statistics response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Statistics error response:', errorText);
      throw new Error('Failed to fetch stats');
    }
    
    const data = await response.json();
    console.log('Statistics data:', data);

    const totalEl = document.getElementById('totalBooks');
    const availableEl = document.getElementById('availableBooks');
    const borrowedEl = document.getElementById('borrowedBooks');
    const membersEl = document.getElementById('memberCount') || document.getElementById('totalMembers');

    if (totalEl) totalEl.innerText = data.total_books ?? 0;
    if (availableEl) availableEl.innerText = data.available_books ?? 0;
    if (borrowedEl) borrowedEl.innerText = data.borrowed_books ?? 0;
    if (membersEl) membersEl.innerText = data.total_members ?? 0;
    
    console.log('Statistics updated successfully');
  } catch (error) {
    console.error('Statistics load failed:', error);
  }
}

async function loadBooks() {
  try {
    const res = await fetch(`/get_books_paginated?filter=${currentFilter}&search=${encodeURIComponent(searchTerm)}&page=${currentPage}&per_page=10&sort=${sortBy}&order=${sortOrder}`);
    if (!res.ok) throw new Error('Failed to load books');
    const data = await res.json();
    const books = data.books || [];
    totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.per_page || 10)));

    const grid = document.getElementById('booksGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!books.length) {
      grid.innerHTML = '<p style="text-align:center; color:var(--text-secondary);">No books found</p>';
      const pag = document.getElementById('pagination');
      if (pag) pag.innerHTML = '';
      return;
    }

    books.forEach(book => {
      const div = document.createElement('div');
      div.className = 'book-card';
      
      const adminButtons = isAdmin ? `
        <div style="margin-top:0.5rem; display:flex; gap:0.5rem;">
            <button class="btn btn-secondary" style="padding:0.3rem 0.6rem; font-size:0.8rem;" onclick="event.stopPropagation(); openEditBook(${book.id}, ${jsonEscape(book.title)}, ${jsonEscape(book.author)}, ${jsonEscape(book.category)}, '${book.status}')">✏️</button>
            <button class="btn btn-secondary" style="padding:0.3rem 0.6rem; font-size:0.8rem;" onclick="event.stopPropagation(); openDeleteBook(${book.id});">🗑️</button>
        </div>
      ` : '';
      
      div.innerHTML = `
        <div class="book-cover" onclick="loadBookDetails(${book.id})" style="cursor:pointer;">
          <span>📘</span>
          <span class="book-status ${book.status === 'available' ? 'available' : 'borrowed'}">${escapeHtml(book.status)}</span>
        </div>
        <div class="book-info" onclick="loadBookDetails(${book.id})" style="cursor:pointer;">
          <div class="book-title">${escapeHtml(book.title)}</div>
          <div class="book-author">${escapeHtml(book.author)}</div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(book.category || '')}</div>
          ${adminButtons}
        </div>
      `;
      grid.appendChild(div);
    });

    renderPagination();
  } catch (err) {
    console.error('loadBooks error', err);
  }
}

function searchBooks(ev) {
  searchTerm = ev.target.value.trim().toLowerCase();
  currentPage = 1;
  loadBooks();
}

function filterBooks(type, btn) {
  currentFilter = type;
  currentPage = 1;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadBooks();
}

function changeSort() {
  const val = document.getElementById('sortSelect').value.split('-');
  sortBy = val[0];
  sortOrder = val[1];
  currentPage = 1;
  loadBooks();
}

function renderPagination() {
  const container = document.getElementById('pagination');
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex; justify-content:center; gap:1rem; margin-top:2rem;">
      <button class="btn btn-secondary" ${currentPage === 1 ? 'disabled' : ''} onclick="prevPage()">⬅️ Previous</button>
      <span style="align-self:center; color:var(--text-secondary);">Page ${currentPage} of ${totalPages}</span>
      <button class="btn btn-secondary" ${currentPage === totalPages ? 'disabled' : ''} onclick="nextPage()">Next ➡️</button>
    </div>
  `;
}
function prevPage() { if (currentPage > 1) { currentPage--; loadBooks(); } }
function nextPage() { if (currentPage < totalPages) { currentPage++; loadBooks(); } }

async function addBook(e) {
  e.preventDefault();
  
  if (!isAdmin) {
    showNotification('Admin login required', 'error');
    return;
  }
  
  const data = {
    title: document.getElementById('bookTitle').value.trim(),
    author: document.getElementById('bookAuthor').value.trim(),
    category: document.getElementById('bookCategory').value.trim()
  };
  if (!data.title || !data.author) { showNotification('Title and Author are required', 'error'); return; }

  try {
    console.log('Adding book:', data);
    const res = await fetch('/add_book', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(data) 
    });
    
    console.log('Add book response status:', res.status);
    
    if (!res.ok) {
      const err = await res.json().catch(()=>({message:'Add failed'}));
      showNotification(err.message || 'Failed to add book', 'error');
      return;
    }
    
    closeModal('addBookModal');
    const form = document.getElementById('bookForm');
    if (form) form.reset();
    showNotification('Book Added!');
    
    console.log('Reloading data...');
    await loadBooks();
    await loadStatistics();
    await renderCharts();
    console.log('All data reloaded');
  } catch (err) {
    console.error('addBook error', err);
    showNotification('Failed to add book', 'error');
  }
}

function openEditBook(id, title, author, category, status) {
  if (!isAdmin) {
    showNotification('Admin login required', 'error');
    return;
  }
  document.getElementById('editBookId').value = id;
  document.getElementById('editBookTitle').value = title.replace(/\\'/g, "'");
  document.getElementById('editBookAuthor').value = author.replace(/\\'/g, "'");
  document.getElementById('editBookCategory').value = (category === 'null' ? '' : (category || ''));
  document.getElementById('editBookStatus').value = status;
  openModal('editBookModal');
}

async function updateBook(e) {
  e.preventDefault();
  const payload = {
    id: document.getElementById('editBookId').value,
    title: document.getElementById('editBookTitle').value.trim(),
    author: document.getElementById('editBookAuthor').value.trim(),
    category: document.getElementById('editBookCategory').value.trim(),
    status: document.getElementById('editBookStatus').value
  };
  try {
    const res = await fetch('/update_book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(()=>({}));
    if (res.ok) {
      showNotification(data.message || 'Book updated!');
      closeModal('editBookModal');
      await loadBooks();
      await loadStatistics();
      await renderCharts();
    } else {
      showNotification(data.message || 'Failed to update', 'error');
    }
  } catch (err) {
    console.error('updateBook error', err);
    showNotification('Failed to update', 'error');
  }
}

function openDeleteBook(id) {
  if (!isAdmin) {
    showNotification('Admin login required', 'error');
    return;
  }
  document.getElementById('deleteBookId').value = id;
  openModal('deleteBookModal');
}

async function confirmDeleteBook() {
  const id = document.getElementById('deleteBookId').value;
  try {
    const res = await fetch('/delete_book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const data = await res.json().catch(()=>({}));
    if (res.ok) {
      showNotification(data.message || 'Deleted');
      closeModal('deleteBookModal');
      await loadBooks();
      await loadStatistics();
      await renderCharts();
    } else {
      showNotification(data.message || 'Delete failed', 'error');
    }
  } catch (err) {
    console.error('confirmDeleteBook error', err);
    showNotification('Delete failed', 'error');
  }
}

async function loadMembers() {
  try {
    const res = await fetch(`/get_members_paginated?search=${encodeURIComponent(memberSearch)}&page=${memberPage}&per_page=6`);
    if (!res.ok) throw new Error('Failed to load members');
    const data = await res.json();
    const grid = document.getElementById('membersGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    (data.members || []).forEach(m => {
      const card = document.createElement('div');
      card.className = 'member-card';
      
      const removeButton = isAdmin ? `
        <button class="btn btn-secondary" onclick="deleteMember(${m.id})">🗑 Remove</button>
      ` : '';
      
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <b style="cursor:pointer;" onclick="openMemberProfile(${m.id})">${escapeHtml(m.name)}</b><br>
            <span style="color:var(--text-secondary)">${escapeHtml(m.email || 'No email')}</span><br>
            <span style="color:var(--text-secondary)">${escapeHtml(m.phone || 'No phone')}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-secondary" onclick="openMemberProfile(${m.id})">Profile</button>
            ${removeButton}
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
    memberTotalPages = Math.max(1, Math.ceil((data.total || 0) / (data.per_page || 6)));
    renderMemberPagination();
  } catch (err) {
    console.error('loadMembers error', err);
  }
}

function searchMembers(ev) {
  memberSearch = ev.target.value.trim().toLowerCase();
  memberPage = 1;
  loadMembers();
}

function renderMemberPagination() {
  const container = document.getElementById('membersPagination');
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex; gap:1rem; align-items:center; margin-top:1rem;">
      <button class="btn btn-secondary" onclick="prevMember()" ${memberPage === 1 ? 'disabled' : ''}>⬅ Prev</button>
      <span style="color:var(--text-secondary)">Page ${memberPage} of ${memberTotalPages}</span>
      <button class="btn btn-secondary" onclick="nextMember()" ${memberPage === memberTotalPages ? 'disabled' : ''}>Next ➡</button>
    </div>
  `;
}

function prevMember() { if (memberPage > 1) { memberPage--; loadMembers(); } }
function nextMember() { if (memberPage < memberTotalPages) { memberPage++; loadMembers(); } }

async function addMember(e) {
  e.preventDefault();
  
  if (!isAdmin) {
    showNotification('Admin login required', 'error');
    return;
  }
  
  const name = document.getElementById('memberName').value.trim();
  const email = document.getElementById('memberEmail').value.trim();
  const phone = document.getElementById('memberPhone').value.trim();

  const nameRegex = /^[A-Za-z\s]+$/;
  if (!nameRegex.test(name)) {
    showNotification('Name must contain only alphabets!', 'error');
    return;
  }

  if (!email.includes('@') || email.endsWith('@')) {
    showNotification('Invalid Email format!', 'error');
    return;
  }

  const phoneRegex = /^[0-9]+$/;
  if (!phoneRegex.test(phone)) {
    showNotification('Phone must contain only digits!', 'error');
    return;
  }

  try {
    console.log('Adding member:', {name, email, phone});
    const res = await fetch('/add_member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone })
    });

    console.log('Add member response status:', res.status);

    if (res.ok) {
      showNotification('Member Added ✅', 'success');
      closeModal('addMemberModal');
      const form = document.getElementById('memberForm');
      if (form) form.reset();
      await loadMembers();
      await loadStatistics();
      await renderCharts();
    } else {
      const err = await res.json().catch(()=>({}));
      showNotification(err.message || 'Failed to add member', 'error');
    }
  } catch (err) {
    console.error('addMember error', err);
    showNotification('Failed to add member', 'error');
  }
}

async function deleteMember(id) {
  if (!isAdmin) {
    showNotification('Admin login required', 'error');
    return;
  }
  if (!confirm('Are you sure you want to remove this member?')) return;
  try {
    const res = await fetch('/delete_member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const data = await res.json().catch(()=>({}));
    if (res.ok) {
      showNotification(data.message || 'Member removed');
      await loadMembers();
      await loadStatistics();
      await renderCharts();
    } else {
      showNotification(data.message || 'Delete failed', 'error');
    }
  } catch (err) {
    console.error('deleteMember error', err);
    showNotification('Delete failed', 'error');
  }
}

async function issueBook(e) {
  e.preventDefault();

  const book_id = parseInt(document.getElementById("issueBookSelect").value);
  const member_id = parseInt(document.getElementById("issueMemberSelect").value);
  const due_date = document.getElementById("issueDueDate").value || null;

  try {
    const res = await fetch("/issue_book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_id, member_id, due_date }),
    });

    const data = await res.json().catch(() => ({}));

    console.log("AI Recommendations received:", data.recommendations);

    if (res.ok) {
      showNotification(data.message || "Book Issued Successfully ✅", "success");
      closeModal("issueBookModal");

      await loadBooks();
      await loadStatistics();
      await renderCharts();
      await refreshIssuableDropdowns();

      if (data.recommendations && data.recommendations.length > 0) {
        let recList = data.recommendations
          .map((b, i) => `<li class="text-sm mb-1">📘 <b>${b.title}</b> — ${b.author}</li>`)
          .join("");

        const modalHTML = `
          <div id="recommendationModal" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div class="bg-white rounded-lg p-6 w-96 shadow-lg">
              <h2 class="text-lg font-bold mb-3 text-center text-blue-700">🤖 Recommended Books for You</h2>
              <ul class="mb-4">${recList}</ul>
              <button id="closeRecModal" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">Close</button>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML("beforeend", modalHTML);
        document.getElementById("closeRecModal").addEventListener("click", () => {
          document.getElementById("recommendationModal").remove();
        });
      }

    } else {
      showNotification(data.message || "Issue failed ❌", "error");
    }

  } catch (err) {
    console.error("issueBook error", err);
    showNotification("Issue failed ❌", "error");
  }
}

async function returnBook(e) {
  e.preventDefault();

  const issue_id = parseInt(document.getElementById("returnBookSelect").value);

  try {
    const res = await fetch("/return_book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue_id }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showNotification("Book Returned ✅", "success");
      closeModal("returnBookModal");
      await loadBooks();
      await loadStatistics();
      await renderCharts();
      await refreshIssuableDropdowns();
    } else {
      showNotification(data.message || "Return failed", "error");
    }
  } catch (err) {
    console.error("returnBook error", err);
    showNotification("Return failed", "error");
  }
}



function attachMemberSelectListener(updateFn) {
  const memberSelect = document.getElementById('issueMemberSelect');
  if (!memberSelectListenerAdded && memberSelect) {
    memberSelect.addEventListener('change', updateFn);
    memberSelectListenerAdded = true;
  }
}

async function refreshIssuableDropdowns() {
  if (dropdownLoading) return;
  dropdownLoading = true;

  const memberSelect = document.getElementById("issueMemberSelect");
  const bookSelect = document.getElementById("issueBookSelect");

  async function updateBookDropdownForMember() {
    const memberId = (memberSelect && memberSelect.value) || '';
    if (!bookSelect) return;
    bookSelect.innerHTML = "<option>Loading...</option>";

    try {
      let res;
      if (memberId) {
        res = await fetch(`/get_recommended_books/${memberId}`);
      } else {
        res = await fetch('/get_books_paginated?filter=available&page=1&per_page=200');
      }

      const data = await res.json();
      bookSelect.innerHTML = '<option value="">Select Book</option>';

      if (memberId && Array.isArray(data) && data.length > 0) {
        data
          .filter(b => b.is_issued !== true)
          .forEach(b => {
            const recommended = b.recommended ? " ⭐ RECOMMENDED" : "";
            const style = b.recommended ? 'style="background-color:#fef3c7; font-weight:bold;"' : '';
            bookSelect.innerHTML += `<option value="${b.id}" ${style}>[ID: ${b.id}] ${escapeHtml(b.title)} by ${escapeHtml(b.author)} (${escapeHtml(b.category || 'No category')})${recommended}</option>`;
          });

        return;
      }

      const books = data.books || data;
      (books || []).forEach(b => {
        if (b.status === 'available' || b.is_issued === false || typeof b.status === 'undefined') {
          bookSelect.innerHTML += `<option value="${b.id}">[ID: ${b.id}] ${escapeHtml(b.title)} by ${escapeHtml(b.author)} (${escapeHtml(b.category || 'No category')})</option>`;
        }
      });

    } catch (err) {
      console.error("Failed to load recommendations", err);
      if (bookSelect) bookSelect.innerHTML = '<option value="">Error loading books</option>';
    }
  }

  try {
    const membersRes = await fetch('/get_members_paginated?page=1&per_page=200');
    const membersData = await membersRes.json();
    if (memberSelect) {
      memberSelect.innerHTML = '<option value="">Select Member</option>';
      (membersData.members || []).forEach(m => {
        memberSelect.innerHTML += `<option value="${m.id}">${escapeHtml(m.name)} (#${m.id})</option>`;
      });
    }
  } catch (err) {
    console.error("Members load failed", err);
  }

  attachMemberSelectListener(updateBookDropdownForMember);

  try {
    const issuedRes = await fetch('/get_issued_books');
    const issuedData = await issuedRes.json();
    const returnSelect = document.getElementById('returnBookSelect');

    if (returnSelect) {
      returnSelect.innerHTML = '<option value="">Select Issued Book</option>';
      (issuedData || []).forEach(i => {
        returnSelect.innerHTML += `<option value="${i.issue_id}">${escapeHtml(i.title)} → ${escapeHtml(i.member_name)} (#${i.issue_id})</option>`;
      });
    }
  } catch (err) {
    console.error("Issued list load failed", err);
  }

  await updateBookDropdownForMember();

  dropdownLoading = false;
}


async function loadIssueHistory() {
  const memberId = document.getElementById('historyMemberFilter').value || '';
  const bookId = document.getElementById('historyBookFilter').value || '';
  const onlyUn = document.getElementById('historyUnreturnedOnly').checked ? '1' : '0';
  const res = await fetch(`/get_issue_history?member_id=${memberId}&book_id=${bookId}&only_unreturned=${onlyUn}`);
  const rows = await res.json();
  const body = document.getElementById('issueHistoryBody');
  if (!rows.length) { body.innerHTML = '<p style="color:var(--text-secondary)">No records</p>'; return; }
  let html = '<table style="width:100%"><thead><tr><th>ID</th><th>Book</th><th>Member</th><th>Issue</th><th>Due</th><th>Return</th><th>Fine</th></tr></thead><tbody>';
  rows.forEach(r => {
    html += `<tr><td>${r.issue_id}</td><td>${escapeHtml(r.title)} (id:${r.book_id})</td><td>${escapeHtml(r.member_name)} (id:${r.member_id})</td><td>${r.issue_date || ''}</td><td>${r.due_date || ''}</td><td>${r.return_date || ''}</td><td>${r.fine}</td></tr>`;
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

function exportIssueHistory() {
  const memberId = document.getElementById('historyMemberFilter').value || '';
  const bookId = document.getElementById('historyBookFilter').value || '';
  const onlyUn = document.getElementById('historyUnreturnedOnly').checked ? '1' : '0';
  window.open(`/export_issue_history?member_id=${memberId}&book_id=${bookId}&only_unreturned=${onlyUn}`, '_blank');
}

async function loadBookDetails(id) {
  openModal('bookDetailsModal');
  const body = document.getElementById('bookDetailsBody');
  if (!body) return;
  body.innerHTML = '<div class="loader"></div>';
  try {
    const res = await fetch(`/get_book_details/${id}`);
    if (!res.ok) { body.innerHTML = `<p style="color:var(--error);">Failed to load</p>`; return; }
    const data = await res.json();
    let html = `<div style="margin-bottom:1rem;"><strong>Title:</strong> ${escapeHtml(data.title)}<br><strong>Author:</strong> ${escapeHtml(data.author)}<br><strong>Category:</strong> ${escapeHtml(data.category || '-')}<br><strong>Status:</strong> <span class="book-status ${data.status}">${escapeHtml(data.status)}</span></div>`;
    if (data.issued_to) {
      html += `<div><strong>Issued To:</strong> ${escapeHtml(data.issued_to)}<br><strong>Issue Date:</strong> ${data.issue_date || ''}<br><strong>Return Date:</strong> ${data.return_date || 'Not Returned'}</div>`;
    } else {
      html += `<p style="color:var(--text-secondary);">This book is currently not issued.</p>`;
    }
    body.innerHTML = html;
  } catch (err) {
    console.error('loadBookDetails error', err);
    body.innerHTML = `<p style="color:var(--error);">Failed to load</p>`;
  }
}

async function openMemberProfile(id) {
  openModal('memberProfileModal');
  const body = document.getElementById('memberProfileBody');
  if (!body) return;
  body.innerHTML = '<div class="loader"></div>';
  try {
    const res = await fetch(`/get_member/${id}`);
    if (!res.ok) { body.innerHTML = `<p style="color:var(--error);">Failed to load</p>`; return; }
    const data = await res.json();
    let html = `<div style="margin-bottom:1rem;"><strong>Name:</strong> ${escapeHtml(data.member.name)}<br><strong>Email:</strong> ${escapeHtml(data.member.email)}<br><strong>Phone:</strong> ${escapeHtml(data.member.phone)}</div>`;
    html += `<h4>Borrowing History</h4>`;
    if (data.history && data.history.length > 0) {
      html += '<table style="width:100%; margin-top:1rem;"><thead><tr><th>Book</th><th>Issue</th><th>Due</th><th>Return</th><th>Fine</th></tr></thead><tbody>';
      data.history.forEach(h => {
        html += `<tr><td>${escapeHtml(h.title)}</td><td>${h.issue_date}</td><td>${h.due_date||'-'}</td><td>${h.return_date||'Not returned'}</td><td>${h.fine}</td></tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += '<p style="color:var(--text-secondary)">No borrowing history</p>';
    }
    body.innerHTML = html;
  } catch (err) {
    console.error('openMemberProfile error', err);
    body.innerHTML = `<p style="color:var(--error);">Failed to load</p>`;
  }
}

async function adminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('adminUsername').value;
  const password = document.getElementById('adminPassword').value;
  
  try {
    const res = await fetch('/admin_login', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username, password }) 
    });
    const data = await res.json().catch(()=>({}));
    
    if (!res.ok) { 
      showNotification(data.message || 'Login failed', 'error'); 
      return; 
    }
    
    showNotification('Logged in as admin ✅');
    closeModal('adminLoginModal');
    isAdmin = true;
    updateAdminUI();
    
    await loadBooks();
    await loadMembers();
  } catch (err) {
    console.error('adminLogin error', err);
    showNotification('Login failed', 'error');
  }
}

async function adminLogout() {
  try {
    await fetch('/admin_logout', { method: 'POST' });
    showNotification('Logged out ✅');
    isAdmin = false;
    updateAdminUI();
    
    await loadBooks();
    await loadMembers();
  } catch (err) {
    console.error('adminLogout error', err);
    showNotification('Logout failed', 'error');
  }
}

function exportBooks() { 
  if (!isAdmin) {
    showNotification('Admin login required', 'error');
    return;
  }
  window.open('/export_books', '_blank'); 
}

function exportMembers() { 
  if (!isAdmin) {
    showNotification('Admin login required', 'error');
    return;
  }
  window.open('/export_members', '_blank'); 
}

async function renderCharts() {
  try {
    console.log('Rendering charts...');
    const res = await fetch('/stats_summary');
    console.log('Chart data response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Chart error response:', errorText);
      return;
    }
    
    const data = await res.json();
    console.log('Chart data:', data);

    const ctx = document.getElementById('booksChart');
    if (ctx && ctx.getContext) {
      const ctx2d = ctx.getContext('2d');
      if (window.booksChartInstance) window.booksChartInstance.destroy();
      window.booksChartInstance = new Chart(ctx2d, {
        type: 'doughnut',
        data: { 
          labels: ['Available', 'Borrowed'], 
          datasets: [{ 
            data: [data.available_books || 0, data.borrowed_books || 0],
            backgroundColor: ['#10b981', '#f59e0b']
          }] 
        },
        options: { responsive: true }
      });
    }

    const cat = document.getElementById('categoriesChart');
    if (cat && cat.getContext && data.top_categories && data.top_categories.length > 0) {
      const ctx3 = cat.getContext('2d');
      if (window.categoriesChartInstance) window.categoriesChartInstance.destroy();
      window.categoriesChartInstance = new Chart(ctx3, {
        type: 'bar',
        data: { 
          labels: data.top_categories.map(c => c.category), 
          datasets: [{ 
            label: 'Books', 
            data: data.top_categories.map(c => c.count),
            backgroundColor: '#6366f1'
          }] 
        },
        options: { responsive: true }
      });
    }
    
    console.log('Charts rendered successfully');
  } catch (err) {
    console.error('Chart render failed', err);
  }
}

async function openAIRecommendationModal(memberId) {
  openModal('aiRecommendationModal');
  const modalBody = document.getElementById('aiRecommendationBody');
  const getRecsBtn = document.getElementById('getAIRecommendations');
  
  modalBody.innerHTML = '<div class="loader"></div><p style="text-align:center; margin-top:1rem;">Loading member data...</p>';
  getRecsBtn.disabled = true;
  
  try {
    
    const res = await fetch(`/get_member_context/${memberId}`);
    if (!res.ok) {
      modalBody.innerHTML = '<p style="color:var(--error);">Failed to load member data</p>';
      return;
    }
    
    const data = await res.json();
    
    let html = `
      <div style="margin-bottom:1.5rem;">
        <h3 style="margin-bottom:0.5rem;">Member: ${escapeHtml(data.member.name)}</h3>
        <p style="color:var(--text-secondary);">ID: ${data.member.id}</p>
      </div>
    `;
    
    if (data.history && data.history.length > 0) {
      html += `
        <div style="margin-bottom:1.5rem;">
          <h4 style="margin-bottom:0.5rem;">Recent Borrowing History:</h4>
          <ul style="list-style:none; padding:0;">
            ${data.history.slice(0, 5).map(book => `
              <li style="padding:0.3rem 0; color:var(--text-secondary);">
                📚 ${escapeHtml(book.title)} by ${escapeHtml(book.author)} 
                ${book.category ? `(${escapeHtml(book.category)})` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    } else {
      html += `<p style="color:var(--text-secondary); margin-bottom:1.5rem;">No borrowing history yet.</p>`;
    }
    
    html += `
      <div id="aiRecommendationResult" style="margin-top:1.5rem;"></div>
    `;
    
    modalBody.innerHTML = html;
    getRecsBtn.disabled = false;
    
    window.currentMemberContext = data;
    
  } catch (err) {
    console.error('Failed to load member context', err);
    modalBody.innerHTML = '<p style="color:var(--error);">Failed to load member data</p>';
  }
}

async function getAIRecommendations() {
  const resultDiv = document.getElementById('aiRecommendationResult');
  const getRecsBtn = document.getElementById('getAIRecommendations');
  
  if (!window.currentMemberContext) {
    showNotification('Member data not loaded', 'error');
    return;
  }
  
  getRecsBtn.disabled = true;
  resultDiv.innerHTML = '<div class="loader"></div><p style="text-align:center; margin-top:1rem;">🤖 Analyzing reading preferences and generating smart recommendations...</p>';
  
  const memberId = window.currentMemberContext.member.id;
  
  try {
    const response = await fetch(`/generate_ai_recommendations/${memberId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const recommendations = await response.json();
    
    if (!recommendations || recommendations.length === 0) {
      resultDiv.innerHTML = '<p style="color:var(--text-secondary);">No suitable recommendations found. Try adding more books to the library!</p>';
      getRecsBtn.disabled = false;
      return;
    }
    
    let html = `
      <div style="background:var(--card-bg); padding:1rem; border-radius:8px; border:2px solid var(--primary);">
        <h3 style="margin-bottom:1rem; color:var(--primary);">🤖 Smart Recommendations</h3>
        <div style="display:flex; flex-direction:column; gap:1rem;">
          ${recommendations.map((book, idx) => `
            <div style="background:var(--bg); padding:1rem; border-radius:6px; border-left:3px solid var(--primary);">
              <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.5rem;">
                <div style="flex:1;">
                  <strong style="font-size:1.1rem;">${idx + 1}. ${escapeHtml(book.title)}</strong>
                  <div style="color:var(--text-secondary); font-size:0.9rem;">
                    by ${escapeHtml(book.author)} ${book.category ? `• ${escapeHtml(book.category)}` : ''}
                  </div>
                </div>
                <button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.85rem; white-space:nowrap; margin-left:1rem;" 
                        onclick="selectRecommendedBook(${book.book_id}, '${escapeHtml(book.title).replace(/'/g, "\\'")}')">
                  Select Book
                </button>
              </div>
              <p style="color:var(--text-secondary); font-size:0.9rem; font-style:italic; margin-top:0.5rem;">
                💡 ${escapeHtml(book.reason)}
              </p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    resultDiv.innerHTML = html;
    showNotification('Recommendations generated! 🎉', 'success');
    
  } catch (err) {
    console.error('AI Recommendation error:', err);
    resultDiv.innerHTML = `<p style="color:var(--error);">Failed to get recommendations: ${err.message}. Please try again.</p>`;
    showNotification('Failed to generate recommendations', 'error');
  } finally {
    getRecsBtn.disabled = false;
  }
}

async function selectRecommendedBook(bookId, bookTitle) {
  console.log('=== SELECTING BOOK ===');
  console.log('Book ID:', bookId);
  console.log('Book Title:', bookTitle);
  
  closeModal('aiRecommendationModal');
  
  window.selectedRecommendedBook = { bookId, bookTitle };
  
  openModal('issueBookModal');

  await new Promise(resolve => setTimeout(resolve, 100));
  
  const memberSelect = document.getElementById('issueMemberSelect');
  const bookSelect = document.getElementById('issueBookSelect');
  
  console.log('Member select exists:', !!memberSelect);
  console.log('Book select exists:', !!bookSelect);
  
  if (!memberSelect || !bookSelect) {
    showNotification('❌ Form elements not found. Please refresh the page.', 'error');
    return;
  }
  
  if (window.currentMemberContext) {
    memberSelect.value = window.currentMemberContext.member.id;
    console.log('Member set to:', memberSelect.value);
  }
  
  if (typeof refreshIssuableDropdowns === 'function') {
    console.log('Refreshing dropdowns...');
    await refreshIssuableDropdowns();
    
    await new Promise(resolve => setTimeout(resolve, 500));
  } else {
    console.log('Manual book loading...');
    bookSelect.innerHTML = '<option value="">Loading...</option>';
    
    try {
      const response = await fetch('/get_books_paginated?filter=available&page=1&per_page=500');
      const data = await response.json();
      
      bookSelect.innerHTML = '<option value="">Select Book</option>';
      
      if (data.books && data.books.length > 0) {
        data.books.forEach(book => {
          const option = document.createElement('option');
          option.value = book.id;
          option.textContent = `${book.title} (${book.category || 'No category'})`;
          bookSelect.appendChild(option);
        });
      }
      
      console.log('Loaded', data.books.length, 'books');
    } catch (err) {
      console.error('Failed to load books:', err);
      showNotification('❌ Failed to load books', 'error');
      return;
    }
  }
  
  console.log('Setting book select to:', bookId);
  bookSelect.value = String(bookId); 
  
  console.log('Book select value after setting:', bookSelect.value);
  console.log('Values match:', bookSelect.value == bookId);
  
  const bookExists = Array.from(bookSelect.options).some(opt => opt.value == bookId);
  console.log('Book exists in dropdown:', bookExists);
  
  if (!bookExists) {
    showNotification(`❌ Book "${bookTitle}" is not available. It may have been issued.`, 'error');
    return;
  }
  
  if (bookSelect.value == bookId) {
    showNotification(`✅ Selected: ${bookTitle}`, 'success');
  
    bookSelect.style.border = '3px solid #10b981';
    bookSelect.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.5)';
    bookSelect.style.backgroundColor = '#ecfdf5';
    
    setTimeout(() => {
      bookSelect.style.border = '';
      bookSelect.style.boxShadow = '';
      bookSelect.style.backgroundColor = '';
    }, 3000);
    
    console.log('✅ Book selected successfully!');
  } else {
    showNotification(`⚠️ Please manually select: ${bookTitle}`, 'warning');
    console.log('⚠️ Auto-selection failed, manual selection needed');
  }
  
  console.log('=== END SELECTION ===');
}

function ensurePendingBookSelection() {
  if (window.pendingBookSelection) {
    const { bookId, bookTitle } = window.pendingBookSelection;
    const bookSelect = document.getElementById('issueBookSelect');
    
    if (bookSelect) {
      
      bookSelect.value = bookId;
      
      if (bookSelect.value == bookId) {
        console.log('Pending book selection applied:', bookTitle);
        
        window.pendingBookSelection = null;
      }
    }
  }
}

function updateIssueBookModalWithAI() {
  const memberSelect = document.getElementById('issueMemberSelect');
  if (!memberSelect || memberSelect.dataset.aiButtonAdded) return;
  
  const aiButton = document.createElement('button');
  aiButton.type = 'button';
  aiButton.className = 'btn btn-secondary';
  aiButton.style.marginTop = '0.5rem';
  aiButton.innerHTML = '🤖 Get AI Recommendations';
  aiButton.onclick = () => {
    const memberId = memberSelect.value;
    if (!memberId) {
      showNotification('Please select a member first', 'error');
      return;
    }
    closeModal('issueBookModal');
    openAIRecommendationModal(parseInt(memberId));
  };
  
  memberSelect.parentElement.appendChild(aiButton);
  memberSelect.dataset.aiButtonAdded = 'true';
}

if (typeof window.openIssueBookModal === 'function') {
  const originalOpenIssueBookModal = window.openIssueBookModal;
  window.openIssueBookModal = function() {
    originalOpenIssueBookModal();
    setTimeout(updateIssueBookModalWithAI, 100);
  };
} else {
  window.openIssueBookModal = function() {
    openModal('issueBookModal');
    setTimeout(updateIssueBookModalWithAI, 100);
  };
}
