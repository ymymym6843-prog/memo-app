document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 요소 참조 ---
    const memoTitleInput = document.getElementById('memo-title');
    const memoContentInput = document.getElementById('memo-content');
    const addMemoButton = document.getElementById('add-memo');
    const memoList = document.getElementById('memo-list');
    const textModeBtn = document.getElementById('text-mode-btn');
    const handwritingModeBtn = document.getElementById('handwriting-mode-btn');
    const textMode = document.getElementById('text-mode');
    const handwritingMode = document.getElementById('handwriting-mode');
    const memoCanvas = document.getElementById('memo-canvas');
    const templateSelector = document.getElementById('template');
    const textOptionsToolbar = document.getElementById('text-options-toolbar');
    const searchInput = document.getElementById('search-input');
    const sortOrderSelect = document.getElementById('sort-order');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const filterFavoritesBtn = document.getElementById('filter-favorites-btn');
    const sessionLockBtn = document.getElementById('session-lock-btn');
    const changePasswordBtn = document.getElementById('change-password-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const fileAttachmentInput = document.getElementById('file-attachment-input');
    const recordAudioBtn = document.getElementById('record-audio-btn');
    const stopAudioBtn = document.getElementById('stop-audio-btn');
    const currentAttachmentsList = document.getElementById('current-attachments-list');
    const canvasUndoBtn = document.getElementById('canvas-undo-btn');
    const canvasRedoBtn = document.getElementById('canvas-redo-btn');
    const canvasClearBtn = document.getElementById('canvas-clear-btn');
    
    // 모달
    const memoModal = document.getElementById('memo-modal');
    const memoModalCloseBtn = memoModal.querySelector('.close-button');
    const modalMemoIndex = document.getElementById('modal-memo-index');
    const modalMemoTitle = document.getElementById('modal-memo-title');
    const modalMemoBody = document.getElementById('modal-memo-body');
    const modalAttachmentsList = document.getElementById('modal-attachments-list');
    const modalSaveButton = document.getElementById('modal-save-button');
    const modalFileAttachmentInput = document.getElementById('modal-file-attachment-input');
    
    // --- 상태 변수 ---
    const ctx = memoCanvas.getContext('2d');
    let memos = JSON.parse(localStorage.getItem('memos')) || [];
    let currentAttachments = [];
    let activeMemoIndex = -1;
    let drawing = false, currentMode = 'text', searchTerm = '', selection = [], showFavoritesOnly = false, isSessionUnlocked = false;
    let currentSortOrder = 'latest';
    let mediaRecorder, audioChunks = [];
    let canvasHistory = [];
    let historyIndex = -1;
    let savedRange = null;

    // --- 유틸리티 ---
    const simpleHash = (str) => { let hash = 0; for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = (hash << 5) - hash + char; hash |= 0; } return hash.toString(); };
    const saveMemos = () => localStorage.setItem('memos', JSON.stringify(memos));

    // --- 렌더링 ---
    const renderMemos = () => {
        memoList.innerHTML = '';
        
        // 1. 정렬
        let memosToRender = [...memos];
        memosToRender.sort((a, b) => {
            switch (currentSortOrder) {
                case 'oldest':
                    return new Date(a.createdAt) - new Date(b.createdAt);
                case 'most-viewed':
                    return (b.viewCount || 0) - (a.viewCount || 0);
                case 'latest':
                default:
                    return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });

        // 2. 즐겨찾기 필터
        const favoriteFiltered = showFavoritesOnly ? memosToRender.filter(memo => memo.isFavorite) : memosToRender;
        
        // 3. 검색 필터
        const searchFiltered = favoriteFiltered.map(memo => ({ ...memo, originalIndex: memos.indexOf(memo) })).filter(memo => memo.title.toLowerCase().includes(searchTerm.toLowerCase()));

        if (searchFiltered.length === 0) { memoList.innerHTML = '<p class="no-results">표시할 노트가 없습니다.</p>'; }

        searchFiltered.forEach(memo => {
            const { originalIndex } = memo;
            const isLocked = memo.isLocked && !isSessionUnlocked;
            const memoItem = document.createElement('div');
            memoItem.className = `memo-item template-${memo.template} ${isLocked ? 'locked-preview' : ''} ${originalIndex === activeMemoIndex ? 'selected' : ''}`;
            const isChecked = selection.includes(originalIndex);
            const previewDiv = document.createElement('div');
            previewDiv.innerHTML = memo.content || '';
            const contentPreview = previewDiv.textContent.substring(0, 50) + (previewDiv.textContent.length > 50 ? '...' : '');
            const attachmentIcon = (memo.attachments && memo.attachments.length > 0) ? ' 📎' : '';

            memoItem.innerHTML = `
                <input type="checkbox" data-index="${originalIndex}" ${isChecked ? 'checked' : ''}>
                <div class="memo-content-preview">
                    <h3>${isLocked ? '🔒 ' + memo.title : memo.title}${attachmentIcon}</h3>
                    <p>${isLocked ? '내용이 잠겨있습니다.' : (memo.type === 'text' ? contentPreview : '[필기 노트]')}</p>
                </div>
                <div class="actions">
                    <button class="lock-btn ${memo.isLocked ? 'locked' : ''}" title="노트 잠금/해제">🔒</button>
                    <button class="favorite-btn ${memo.isFavorite ? 'favorited' : ''}" title="즐겨찾기">★</button>
                    <button class="delete-single" title="삭제">&times;</button>
                </div>
            `;
            memoItem.querySelector('input[type="checkbox"]').addEventListener('change', (e) => handleCheckboxChange(e, originalIndex));
            memoItem.querySelector('.memo-content-preview').addEventListener('click', () => { if (isLocked) { unlockSession(); return; } openMemoModal(originalIndex); });
            memoItem.querySelector('.lock-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleLock(originalIndex); });
            memoItem.querySelector('.favorite-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(originalIndex); });
            memoItem.querySelector('.delete-single').addEventListener('click', (e) => { e.stopPropagation(); handleDeleteClick([originalIndex]); });
            memoList.appendChild(memoItem);
        });
        selectAllCheckbox.checked = searchFiltered.length > 0 && selection.length === searchFiltered.length;
    };

    const renderAttachments = (attachmentArray, containerElement) => {
        containerElement.innerHTML = '';
        attachmentArray.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'attachment-item-editor';
            item.innerHTML = `
                <span>${file.name}</span>
                <div class="attachment-actions">
                    <button class="attachment-download-btn" data-index="${index}" title="다운로드">Download</button>
                    <button class="attachment-delete-btn" data-index="${index}" title="삭제">&times;</button>
                </div>
            `;
            
            item.querySelector('.attachment-download-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const fileToDownload = attachmentArray[index];
                const a = document.createElement('a');
                a.href = fileToDownload.src;
                a.download = fileToDownload.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });

            item.querySelector('.attachment-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                attachmentArray.splice(index, 1);
                if (activeMemoIndex === -1) {
                    renderAttachments(currentAttachments, currentAttachmentsList);
                } else {
                    renderAttachments(memos[activeMemoIndex].attachments, modalAttachmentsList);
                }
            });
            containerElement.appendChild(item);
        });
    };

    // --- 기능 핸들러 ---
    const handleCheckboxChange = (e, index) => { if (e.target.checked) { if (!selection.includes(index)) selection.push(index); } else { selection = selection.filter(i => i !== index); } };
    const handleSelectAll = (e) => { selection = []; if (e.target.checked) { memos.forEach((memo, index) => selection.push(index)); } renderMemos(); };
    const handleDeleteSelected = () => { if (selection.length === 0) { alert('삭제할 노트를 선택하세요.'); return; } if (confirm(`선택된 ${selection.length}개의 노트를 정말 삭제하시겠습니까?`)) { handleDeleteClick(selection); selection = []; } };
    const handleSearch = (e) => { searchTerm = e.target.value; renderMemos(); };
    const handleSort = (e) => { currentSortOrder = e.target.value; renderMemos(); };
    const toggleFavorite = (index) => { memos[index].isFavorite = !memos[index].isFavorite; saveMemos(); renderMemos(); };
    const toggleLock = (index) => { if (!isSessionUnlocked) { alert('먼저 세션 잠금을 해제해야 합니다.'); unlockSession(); return; } memos[index].isLocked = !memos[index].isLocked; saveMemos(); renderMemos(); };
    const handleFilterFavorites = () => { showFavoritesOnly = !showFavoritesOnly; filterFavoritesBtn.classList.toggle('active', showFavoritesOnly); renderMemos(); };
    
    // --- 텍스트 에디터 ---
    const saveSelection = () => { const selection = window.getSelection(); if (selection.rangeCount > 0) { if (memoContentInput.contains(selection.anchorNode)) { savedRange = selection.getRangeAt(0); } } };
    const restoreSelection = () => { if (savedRange) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange); } };
    const applyStyle = (command, value = null) => { restoreSelection(); memoContentInput.focus(); document.execCommand(command, false, value); saveSelection(); };

    // --- 첨부파일 및 녹음 ---
    const handleFileAttachment = (e, isModal) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const newAttachment = { type: file.type.startsWith('image/') ? 'image' : 'audio', src: event.target.result, name: file.name };
            if (isModal) {
                memos[activeMemoIndex].attachments.push(newAttachment);
                renderAttachments(memos[activeMemoIndex].attachments, modalAttachmentsList);
            } else {
                currentAttachments.push(newAttachment);
                renderAttachments(currentAttachments, currentAttachmentsList);
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };
    const startRecording = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); let mimeType = 'audio/webm'; if (MediaRecorder.isTypeSupported('audio/wav')) { mimeType = 'audio/wav'; } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) { mimeType = 'audio/webm;codecs=opus'; } mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType }); mediaRecorder.start(); audioChunks = []; mediaRecorder.addEventListener('dataavailable', event => { audioChunks.push(event.data); }); mediaRecorder.addEventListener('stop', () => { const audioBlob = new Blob(audioChunks, { type: mimeType }); const reader = new FileReader(); reader.onload = (event) => { const newAttachment = { type: 'audio', src: event.target.result, name: `recording-${Date.now()}.${mimeType.split('/')[1].split(';')[0]}` }; if (activeMemoIndex > -1) { memos[activeMemoIndex].attachments.push(newAttachment); renderAttachments(memos[activeMemoIndex].attachments, modalAttachmentsList); } else { currentAttachments.push(newAttachment); renderAttachments(currentAttachments, currentAttachmentsList); } }; reader.readAsDataURL(audioBlob); }); recordAudioBtn.hidden = true; stopAudioBtn.hidden = false; } catch (err) { console.error("Error recording audio: ", err); alert("음성 녹음을 사용하려면 마이크 접근 권한이 필요합니다."); } };
    const stopRecording = () => { if(mediaRecorder) mediaRecorder.stop(); recordAudioBtn.hidden = false; stopAudioBtn.hidden = true; };

    // --- 템플릿 및 테마 ---
    const applyTemplate = (template) => { const areas = [memoContentInput, memoCanvas]; const templateClasses = ['template-basic', 'template-lined', 'template-grid', 'template-chalkboard']; areas.forEach(area => { area.classList.remove(...templateClasses); if (template !== 'basic') { area.classList.add(`template-${template}`); } }); };
    const setTheme = (theme) => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); themeToggle.checked = theme === 'dark'; };

    // --- 모달 ---
    const openMemoModal = (index) => {
        const memo = memos[index];
        if (memo.isLocked && !isSessionUnlocked) { unlockSession(); return; }
        
        // 조회수 증가
        if (!memo.viewCount) memo.viewCount = 0;
        memo.viewCount++;
        saveMemos();

        activeMemoIndex = index;
        modalMemoIndex.value = index;
        modalMemoTitle.value = memo.title;
        modalMemoBody.innerHTML = memo.content;
        modalMemoBody.className = `editable-area template-${memo.template}`;
        if (!memo.attachments) memo.attachments = [];
        renderAttachments(memo.attachments, modalAttachmentsList);
        memoModal.style.display = 'block';
    };
    const closeMemoModal = () => { memoModal.style.display = 'none'; activeMemoIndex = -1; renderMemos(); };
    const saveModalChanges = () => { const index = modalMemoIndex.value; if (index === '' || index < 0) return; memos[index].title = modalMemoTitle.value; memos[index].content = modalMemoBody.innerHTML; saveMemos(); closeMemoModal(); };
    
    // --- CRUD ---
    const addMemo = () => {
        const title = memoTitleInput.value.trim();
        if (title === '') { alert('제목을 입력해주세요.'); return; }
        let memo = { title, template: templateSelector.value, type: currentMode, isFavorite: false, isLocked: false, content: '', attachments: currentAttachments, createdAt: new Date().toISOString(), viewCount: 0 };
        if (currentMode === 'text') {
            const content = memoContentInput.innerHTML;
            if (content.trim() === '' && currentAttachments.length === 0) { alert('내용을 입력해주세요.'); return; }
            memo.content = content;
        } else {
            memo.content = memoCanvas.toDataURL();
            clearCanvas(true); // Clear canvas and history
        }
        memos.push(memo);
        saveMemos();
        renderMemos();
        memoTitleInput.value = '';
        memoContentInput.innerHTML = '';
        currentAttachments = [];
        renderAttachments(currentAttachments, currentAttachmentsList);
    };
    const handleDeleteClick = (indicesToDelete) => { indicesToDelete.sort((a, b) => b - a).forEach(index => memos.splice(index, 1)); saveMemos(); renderMemos(); };

    // --- UI 제어 및 캔버스 ---
    const switchMode = (mode) => { currentMode = mode; textMode.classList.toggle('active', mode === 'text'); handwritingMode.classList.toggle('active', mode === 'handwriting'); textModeBtn.classList.toggle('active', mode === 'text'); handwritingModeBtn.classList.toggle('active', mode === 'handwriting'); if (mode === 'handwriting') { resizeCanvas(); initCanvasHistory(); } };
    const resizeCanvas = () => { requestAnimationFrame(() => { const container = handwritingMode; if(container.clientWidth > 0) { memoCanvas.width = container.clientWidth; memoCanvas.height = container.clientHeight; redrawCanvas(); } }); };
    
    const initCanvasHistory = () => { canvasHistory = [memoCanvas.toDataURL()]; historyIndex = 0; };
    const saveCanvasState = () => { if (historyIndex < canvasHistory.length - 1) { canvasHistory = canvasHistory.slice(0, historyIndex + 1); } canvasHistory.push(memoCanvas.toDataURL()); historyIndex++; };
    const redrawCanvas = () => { if (canvasHistory.length === 0 || historyIndex < 0) return; const img = new Image(); img.onload = () => { ctx.clearRect(0, 0, memoCanvas.width, memoCanvas.height); ctx.drawImage(img, 0, 0); }; img.src = canvasHistory[historyIndex]; };
    const undoCanvas = () => { if (historyIndex > 0) { historyIndex--; redrawCanvas(); } };
    const redoCanvas = () => { if (historyIndex < canvasHistory.length - 1) { historyIndex++; redrawCanvas(); } };
    const clearCanvas = (isSaving = false) => { ctx.clearRect(0, 0, memoCanvas.width, memoCanvas.height); if (!isSaving) saveCanvasState(); };

    const startDrawing = (e) => { drawing = true; draw(e); };
    const stopDrawing = () => { if (!drawing) return; drawing = false; ctx.beginPath(); saveCanvasState(); };
    const draw = (e) => { if (!drawing) return; const isChalkboard = templateSelector.value === 'chalkboard'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = (isChalkboard || document.documentElement.dataset.theme === 'dark') ? '#FFFFFF' : '#000000'; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };

    // --- 비밀번호 관련 ---
    const isPasswordSet = () => !!localStorage.getItem('memoPasswordHash');
    const checkPassword = (password) => simpleHash(password) === localStorage.getItem('memoPasswordHash');
    const setPassword = () => { const p1 = prompt('새 비밀번호 (5자 이상)'); if (p1 && p1.length >= 5) { const p2 = prompt('비밀번호 확인'); if (p1 === p2) { localStorage.setItem('memoPasswordHash', simpleHash(p1)); alert('설정 완료'); return true; } else { alert('불일치'); } } else if (p1) { alert('5자 이상'); } return false; };
    const handleChangePassword = () => { if (!isPasswordSet()) { setPassword(); } else { const old = prompt('기존 비밀번호'); if (checkPassword(old)) { setPassword(); } else { alert('불일치'); } } };
    const unlockSession = () => { if (!isPasswordSet()) { if (setPassword()) isSessionUnlocked = true; } else { const p = prompt('비밀번호'); if (checkPassword(p)) isSessionUnlocked = true; else alert('불일치'); } updateSessionLockState(); renderMemos(); };
    const lockSession = () => { isSessionUnlocked = false; updateSessionLockState(); renderMemos(); };
    const updateSessionLockState = () => { sessionLockBtn.classList.toggle('unlocked', isSessionUnlocked); sessionLockBtn.title = isSessionUnlocked ? '세션 잠금' : '잠금 해제'; };

    // --- 이벤트 리스너 등록 ---
    addMemoButton.addEventListener('click', addMemo);
    textModeBtn.addEventListener('click', () => switchMode('text'));
    handwritingModeBtn.addEventListener('click', () => switchMode('handwriting'));
    
    // 텍스트 에디터 이벤트
    memoContentInput.addEventListener('keyup', saveSelection);
    memoContentInput.addEventListener('mouseup', saveSelection);
    memoContentInput.addEventListener('blur', saveSelection);

    textOptionsToolbar.addEventListener('mousedown', (e) => {
        const target = e.target.closest('[data-command]');
        if (target && target.tagName === 'BUTTON') {
            e.preventDefault(); // 버튼만 포커스 뺏기 방지
        }
    });
    textOptionsToolbar.addEventListener('click', (e) => {
        const target = e.target.closest('[data-command]');
        if (target && target.tagName === 'BUTTON') {
            applyStyle(target.dataset.command);
        }
    });
    textOptionsToolbar.addEventListener('change', (e) => {
        const target = e.target.closest('[data-command]');
        if (target && (target.tagName === 'SELECT' || target.type === 'color')) {
            applyStyle(target.dataset.command, target.value);
        }
    });

    templateSelector.addEventListener('change', (e) => applyTemplate(e.target.value));
    searchInput.addEventListener('input', handleSearch);
    sortOrderSelect.addEventListener('change', handleSort);
    selectAllCheckbox.addEventListener('change', handleSelectAll);
    deleteSelectedBtn.addEventListener('click', handleDeleteSelected);
    filterFavoritesBtn.addEventListener('click', handleFilterFavorites);
    sessionLockBtn.addEventListener('click', () => isSessionUnlocked ? lockSession() : unlockSession());
    changePasswordBtn.addEventListener('click', handleChangePassword);
    themeToggle.addEventListener('change', (e) => setTheme(e.target.checked ? 'dark' : 'light'));
    memoModalCloseBtn.addEventListener('click', closeMemoModal);
    modalSaveButton.addEventListener('click', saveModalChanges);
    window.addEventListener('click', (e) => { if (e.target == memoModal) closeMemoModal(); });
    memoCanvas.addEventListener('mousedown', startDrawing);
    memoCanvas.addEventListener('mouseup', stopDrawing);
    memoCanvas.addEventListener('mousemove', draw);
    canvasUndoBtn.addEventListener('click', undoCanvas);
    canvasRedoBtn.addEventListener('click', redoCanvas);
    canvasClearBtn.addEventListener('click', () => clearCanvas(false));
    window.addEventListener('resize', resizeCanvas);
    fileAttachmentInput.addEventListener('change', (e) => handleFileAttachment(e, false));
    modalFileAttachmentInput.addEventListener('change', (e) => handleFileAttachment(e, true));
    recordAudioBtn.addEventListener('click', startRecording);
    stopAudioBtn.addEventListener('click', stopRecording);

    // --- 초기화 ---
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    applyTemplate(templateSelector.value);
    updateSessionLockState();
    renderMemos();
    switchMode('text');
});