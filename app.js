import { auth, signInAnonymously, onSnapshot, getPosCol, getPosDoc, updateDoc, addDoc, deleteDoc } from './firebase-db.js';

let isAuthReady = false;

let tbChartInc = null, tbChartExp = null;
let dashChartInc = null, dashChartExp = null;
let libChartInc = null, libChartExp = null; 

let categories = [], mutations = [], trashMutations = [];
let pendingDeposits = [], rawTransactions = [];
let windowAllCloseRegisters = []; 
let brankasData = [], archivesData = [];

let expenseMode = 'single'; 
let bulkItems = [{ name: '', price: '' }];
let currentTheme = 'dark';

window.tempTbNotes = []; 

// Helper Format Titik Ribuan
const formatRp = (num) => "Rp " + (parseFloat(num) || 0).toLocaleString('id-ID');

const parseCurrencyStr = (str) => {
    if(!str) return 0;
    return parseFloat(str.toString().replace(/\./g, '')) || 0;
};

window.formatCurrencyInput = (el) => {
    let val = el.value.replace(/[^0-9]/g, '');
    if(val) el.value = parseInt(val).toLocaleString('id-ID');
    else el.value = '';
};

const getTodayYMD = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().split('T')[0]; };

const formatEditTime = (isoString) => {
    if(!isoString) return '';
    const d = new Date(isoString);
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};

const showToast = (msg, type = 'info') => { 
    const t = document.getElementById('toast'); 
    document.getElementById('toast-msg').innerText = msg;
    const icon = document.getElementById('toast-icon');
    if(type === 'error') { t.className = "fixed top-4 right-4 z-[110] px-5 py-3.5 rounded-2xl shadow-2xl text-[10px] uppercase tracking-widest font-black flex items-center space-x-3 transition-all duration-300 transform scale-100 opacity-100 bg-rose-500 text-white border border-rose-600"; icon.className = "ph ph-warning-circle text-xl"; }
    else { t.className = "fixed top-4 right-4 z-[110] px-5 py-3.5 rounded-2xl shadow-2xl text-[10px] uppercase tracking-widest font-black flex items-center space-x-3 transition-all duration-300 transform scale-100 opacity-100 bg-emerald-500 text-slate-900 border border-emerald-400"; icon.className = "ph ph-check-circle text-xl"; }
    setTimeout(() => { t.classList.remove('scale-100', 'opacity-100'); t.classList.add('scale-95', 'opacity-0'); setTimeout(() => t.classList.add('hidden'), 300); }, 3500); 
};

window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.toggleMobileMenu = () => document.getElementById('mobile-menu').classList.toggle('hidden');

window.toggleTheme = () => {
    currentTheme = currentTheme === 'dark' ? 'soft' : 'dark';
    const themeName = currentTheme === 'dark' ? 'Ubah ke Soft Mode' : 'Ubah ke Night Mode';
    
    if (currentTheme === 'soft') document.body.classList.add('theme-soft');
    else document.body.classList.remove('theme-soft');
    
    document.getElementById('theme-text-desktop').innerText = themeName;
    document.getElementById('theme-text-mobile').innerText = themeName;
    
    if(!document.getElementById('tab-dashboard').classList.contains('hidden')) window.applyDashboardFilter();
    if(!document.getElementById('tb-result-container').classList.contains('hidden')) window.generateTutupBuku();
};

window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    document.getElementById('page-title').innerText = tabName.replace('-', ' ');
    
    document.querySelectorAll('[id^="btn-tab-"]').forEach(b => {
        b.classList.remove('bg-theme-bg', 'border', 'border-theme-border', 'text-theme-text');
        b.classList.add('text-theme-muted', 'hover:bg-theme-bg/50');
        const i = b.querySelector('i'); if(i) i.classList.remove('text-theme-accent');
    });
    
    const activeBtn = document.getElementById(`btn-tab-${tabName}`);
    if(activeBtn) {
        activeBtn.classList.remove('text-theme-muted', 'hover:bg-theme-bg/50');
        activeBtn.classList.add('bg-theme-bg', 'border', 'border-theme-border', 'text-theme-text');
        const i = activeBtn.querySelector('i'); if(i) i.classList.add('text-theme-accent');
    }

    if(tabName === 'dashboard') window.applyDashboardFilter();
    if(tabName === 'library') renderArchives();
};

window.setupAutoFormatListeners = () => {
    const incAmount = document.getElementById('inc-amount');
    if (incAmount) { incAmount.addEventListener('input', function() { window.formatCurrencyInput(this); }); }
    const expAmount = document.getElementById('exp-amount');
    if (expAmount) { expAmount.addEventListener('input', function() { window.formatCurrencyInput(this); }); }
};

window.toggleBulkAccordion = (id) => {
    const content = document.getElementById(`bulk-acc-${id}`);
    const icon = document.getElementById(`bulk-icon-${id}`);
    if(content.classList.contains('hidden')) { 
        content.classList.remove('hidden'); 
        icon.style.transform = 'rotate(180deg)'; 
    } else { 
        content.classList.add('hidden'); 
        icon.style.transform = 'rotate(0deg)'; 
    }
};

async function initAuth() {
    try { 
        await signInAnonymously(auth); 
        isAuthReady = true;
        
        onSnapshot(getPosCol('finance_categories'), (snap) => {
            categories = []; 
            let sysNames = ['Setoran', 'Pindah ke Brankas', 'Cairkan dari Brankas'];
            const sysColors = { 'Setoran': '#10b981', 'Pindah ke Brankas': '#f59e0b', 'Cairkan dari Brankas': '#3b82f6' };

            snap.forEach(d => { const data = d.data(); if(!sysNames.includes(data.name)) categories.push({ id: d.id, ...data }); });
            sysNames.forEach(name => categories.push({ 
                id: 'sys_'+name, name: name, 
                type: name==='Setoran'||name==='Cairkan dari Brankas'?'income':'expense', 
                color: sysColors[name] || '#64748b', isSystem: true 
            }));
            renderCategories(); updateCategoryDropdowns();
        });

        onSnapshot(getPosCol('finance_mutations'), (snap) => {
            mutations = []; trashMutations = []; const nowTime = new Date().getTime();
            snap.forEach(d => {
                const data = d.data();
                if(data.isDeleted) {
                    const delTime = new Date(data.deletedAt).getTime(); const diffDays = (nowTime - delTime) / (1000 * 3600 * 24);
                    if(diffDays > 2) deleteDoc(getPosDoc("finance_mutations", d.id)); 
                    else trashMutations.push({ id: d.id, ...data });
                } else { mutations.push({ id: d.id, ...data }); }
            });
            mutations.sort((a, b) => new Date(b.date) - new Date(a.date));
            trashMutations.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
            
            calculateTotalKas(); window.applyDashboardFilter(); window.filterMutasiTables(); renderTrashTable();
            if(!document.getElementById('tab-library').classList.contains('hidden')) renderArchives();
            if(typeof window.checkPosRevisions === 'function') window.checkPosRevisions();
            if(document.getElementById('loading-screen')) document.getElementById('loading-screen').classList.add('opacity-0', 'pointer-events-none');
        });

        onSnapshot(getPosCol('finance_brankas'), (snap) => {
            brankasData = [];
            snap.forEach(d => { brankasData.push({ id: d.id, ...d.data() }); });
            brankasData.sort((a, b) => new Date(b.date) - new Date(a.date));
            renderBrankas(); window.applyDashboardFilter(); 
        });

        onSnapshot(getPosCol('finance_archives'), (snap) => {
            archivesData = [];
            snap.forEach(d => { archivesData.push({ id: d.id, ...d.data() }); });
            archivesData.sort((a, b) => b.timestamp - a.timestamp);
            renderArchives();
            calculateTotalKas(); 
        });

        onSnapshot(getPosCol('close_registers'), (snap) => {
            pendingDeposits = []; windowAllCloseRegisters = [];
            snap.forEach(d => {
                const data = d.data();
                windowAllCloseRegisters.push({ id: d.id, ...data });
                if(data.finance_status !== 'confirmed') { 
                    pendingDeposits.push({ 
                        id: d.id, date: data.tanggal || '-', time: data.waktu ? data.waktu.split(' ')[1] : '',
                        cashierName: data.kasir || 'Kasir', amount: data.setoranCashReal || 0, source: 'close_registers', ...data 
                    }); 
                }
            });
            processPendingDeposits();
            if(typeof window.checkPosRevisions === 'function') window.checkPosRevisions();
        });
        
        onSnapshot(getPosCol('transactions'), (snap) => {
            rawTransactions = [];
            snap.forEach(d => { rawTransactions.push({ id: d.id, ...d.data() }); });
        });

        setTimeout(() => {
            if(document.getElementById('loading-screen')) {
                document.getElementById('loading-screen').classList.add('opacity-0');
                setTimeout(() => { if(document.getElementById('loading-screen')) document.getElementById('loading-screen').classList.add('pointer-events-none'); }, 500);
            }
        }, 3000);

    } catch(e) { console.error("Login Failed:", e); showToast("Koneksi Error", "error"); }
}

const calculateTotalKas = () => {
    let total = 0;
    archivesData.forEach(a => { total += parseFloat(a.netProfit) || 0; });
    mutations.filter(m => !m.isArchived).forEach(m => {
        if (m.type === 'income') total += parseFloat(m.amount) || 0;
        else if (m.type === 'expense') total -= parseFloat(m.amount) || 0;
    });
    document.getElementById('total-kas-display').innerText = formatRp(total);
};

const processPendingDeposits = () => {
    pendingDeposits.sort((a, b) => new Date(a.date) - new Date(b.date));
    let tbody = pendingDeposits.length ? '' : `<tr><td colspan="4" class="px-6 py-8 text-center text-theme-muted font-bold text-[10px] uppercase tracking-widest border-b border-theme-border border-dashed"><i class="ph ph-check-circle text-2xl block mb-2 opacity-50"></i>Belum ada setoran POS masuk.</td></tr>`;
    pendingDeposits.forEach(d => {
        tbody += `
            <tr class="border-b border-theme-border/30 hover:bg-theme-bg/80 even:bg-theme-bg/30 transition-colors">
                <td class="px-5 py-3 text-theme-text font-black">${d.date.split('-').reverse().join('/')} <span class="text-[9px] text-theme-muted ml-2 font-bold bg-theme-bg px-2 py-1 rounded border border-theme-border">${d.time||''}</span></td>
                <td class="px-5 py-3"><span class="px-2.5 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-lg text-[8px] font-black uppercase tracking-widest"><i class="ph ph-user mr-1"></i>${d.cashierName}</span></td>
                <td class="px-5 py-3 text-right font-black text-emerald-500 text-sm tracking-tight drop-shadow-sm">${formatRp(d.amount)}</td>
                <td class="px-5 py-3 text-center">
                    <button onclick="window.openConfirmDeposit('${d.id}', ${d.amount}, '${d.date}', '${d.source}', '${d.cashierName}')" class="px-4 py-2 bg-emerald-500 text-slate-900 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md hover:-translate-y-0.5 transition-transform"><i class="ph ph-check-circle mr-1"></i>Terima</button>
                </td>
            </tr>`;
    }); document.getElementById('pending-table-body').innerHTML = tbody;
};

window.openConfirmDeposit = (depId, amount, date, source, cashierName) => {
    document.getElementById('dep-modal-id').value = depId;
    document.getElementById('dep-modal-amount').value = amount; 
    document.getElementById('dep-modal-actual').value = amount.toLocaleString('id-ID'); 
    document.getElementById('dep-modal-date').value = date;
    document.getElementById('dep-modal-source').value = source;
    document.getElementById('dep-modal-notes').value = '';
    document.getElementById('dep-modal-info').innerHTML = `Dari Laporan POS: <b class="text-theme-text">${cashierName} (${date.split('-').reverse().join('/')})</b><br>Nominal Sistem (Harus Disetor): <b class="text-theme-text">${formatRp(amount)}</b>`;
    
    document.getElementById('deposit-modal').classList.remove('hidden');
    document.getElementById('deposit-modal').classList.add('flex');
};

document.getElementById('deposit-form').addEventListener('submit', async (e) => {
    e.preventDefault(); if(!isAuthReady) return;
    const btn = document.getElementById('btn-submit-deposit'); const origText = btn.innerHTML; btn.innerText = "Memproses..."; btn.disabled = true;
    try {
        const depId = document.getElementById('dep-modal-id').value;
        const posAmount = Number(document.getElementById('dep-modal-amount').value);
        const actualAmount = parseCurrencyStr(document.getElementById('dep-modal-actual').value);
        const date = document.getElementById('dep-modal-date').value;
        const source = document.getElementById('dep-modal-source').value;
        const customNotes = document.getElementById('dep-modal-notes').value;

        let finalDesc = source === 'close_registers' ? `Setoran Kasir (POS)` : `Setoran Kasir (Tarik Raw POS)`;
        
        if(actualAmount !== posAmount) {
            const diff = actualAmount - posAmount;
            const statusStr = diff > 0 ? `Lebih ${formatRp(diff)}` : `Kurang ${formatRp(Math.abs(diff))}`;
            finalDesc += ` [Fisik ${statusStr} dr Sistem]`;
        }
        if(customNotes) finalDesc += ` - Catatan: ${customNotes}`;

        if(source === 'close_registers') {
            await updateDoc(getPosDoc("close_registers", depId), { finance_status: 'confirmed', finance_confirmedAt: new Date().toISOString() });
        }
        
        await addDoc(getPosCol("finance_mutations"), { 
            type: 'income', date: date, category: 'Setoran', 
            amount: actualAmount, posNominal: posAmount, sourceId: depId, 
            description: finalDesc, createdAt: new Date().toISOString(), isDeleted: false, isArchived: false
        });
        
        showToast("Setoran Diterima & Disimpan!", "success");
        if(source === 'raw_transactions') {
            pendingDeposits = pendingDeposits.filter(p => p.id !== depId); processPendingDeposits();
        }
        window.closeModal('deposit-modal');
    } catch(err) { showToast(err.message, 'error'); } finally { btn.innerHTML = origText; btn.disabled = false; }
});

window.checkPosRevisions = () => {
    const revContainer = document.getElementById('pos-revisions-container');
    if(!revContainer) return;
    let revHtml = '';
    windowAllCloseRegisters.forEach(cr => {
        if(cr.finance_status === 'confirmed') {
            const linkedMut = mutations.find(m => m.sourceId === cr.id && !m.isDeleted && !m.isArchived);
            if(linkedMut && linkedMut.posNominal !== undefined && linkedMut.posNominal !== cr.setoranCashReal) {
                revHtml += `<div class="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-sm relative overflow-hidden group">
                    <div class="absolute -right-4 -top-4 text-rose-500/10 text-6xl transform group-hover:scale-110 transition-transform"><i class="ph ph-warning"></i></div>
                    <div class="z-10">
                        <p class="text-xs font-black text-rose-500 uppercase tracking-widest flex items-center"><i class="ph ph-warning-circle mr-2 text-lg"></i> Revisi Laporan POS Terdeteksi!</p>
                        <p class="text-[10px] font-bold text-theme-muted mt-1 leading-relaxed">Tutup Buku <b>${cr.kasir} (${cr.tanggal.split('-').reverse().join('/')})</b> baru saja diubah oleh Manager POS. Nominal sistem berubah dari <b>${formatRp(linkedMut.posNominal)}</b> menjadi <b class="text-rose-500">${formatRp(cr.setoranCashReal)}</b>.</p>
                    </div>
                    <div class="z-10 shrink-0 w-full md:w-auto">
                        <button onclick="window.syncPosRevision('${linkedMut.id}', ${cr.setoranCashReal}, ${linkedMut.posNominal})" class="w-full md:w-auto px-5 py-2.5 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-rose-600 transition-all flex items-center justify-center"><i class="ph ph-arrows-clockwise mr-2"></i>Tandai Sudah Sesuai</button>
                        <p class="text-[8px] text-theme-muted mt-1 text-center font-bold">Catatan: Jika uang fisik ikut berubah, gunakan ikon pensil di tabel Mutasi.</p>
                    </div>
                </div>`;
            }
        }
    });
    revContainer.innerHTML = revHtml;
};

window.syncPosRevision = async (mutId, newPosAmount, oldPosAmount) => {
    try {
        const mut = mutations.find(m => m.id === mutId);
        const desc = `[Update POS dr ${formatRp(oldPosAmount)}] ` + (mut.description || '');
        await updateDoc(getPosDoc("finance_mutations", mutId), { posNominal: newPosAmount, description: desc, updatedAt: new Date().toISOString() });
        showToast("Notifikasi Revisi POS dihilangkan", "success");
    } catch(e) { showToast(e.message, "error"); }
};

window.fetchRawTransactionsForSetoran = () => {
    let aggregated = {};
    rawTransactions.filter(t => t.status === 'Aktif' && t.pembayaran === 'CASH').forEach(t => {
        const dt = t.tanggal;
        if(!aggregated[dt]) aggregated[dt] = { total: 0, count: 0, date: dt, kasir: t.kasir };
        aggregated[dt].total += t.total;
        aggregated[dt].count++;
    });
    
    let foundNew = 0;
    for(let date in aggregated) {
        const isAlreadyConfirmed = mutations.some(m => m.date === date && m.category === 'Setoran');
        const isPendingCR = windowAllCloseRegisters.some(cr => cr.tanggal === date);
        const isPendingRaw = pendingDeposits.some(p => p.date === date && p.source === 'raw_transactions');
        
        if(!isAlreadyConfirmed && !isPendingCR && !isPendingRaw && aggregated[date].total > 0) {
            pendingDeposits.push({ id: 'raw_'+date, date: date, cashierName: 'Sistem Tarik Raw', amount: aggregated[date].total, source: 'raw_transactions' });
            foundNew++;
        }
    }
    if(foundNew > 0) { showToast(`Menemukan ${foundNew} data raw harian.`, 'success'); processPendingDeposits(); }
    else { showToast("Tidak ada data raw baru yg bisa ditarik."); }
};

window.filterMutasiTables = () => {
    const incCat = document.getElementById('filter-income-cat').value;
    const incDate = document.getElementById('filter-income-date').value;
    const expCat = document.getElementById('filter-expense-cat').value;
    const expDate = document.getElementById('filter-expense-date').value;

    let filteredInc = mutations.filter(m => m.type === 'income' && !m.isArchived);
    if(incCat !== 'ALL') filteredInc = filteredInc.filter(m => m.category === incCat);
    if(incDate) filteredInc = filteredInc.filter(m => m.date === incDate);

    let filteredExp = mutations.filter(m => m.type === 'expense' && !m.isArchived);
    if(expCat !== 'ALL') filteredExp = filteredExp.filter(m => m.category === expCat);
    if(expDate) filteredExp = filteredExp.filter(m => m.date === expDate);

    renderMutasiTable('income-list', filteredInc, 'income');
    renderMutasiTable('expense-list', filteredExp, 'expense');
};

const renderMutasiTable = (containerId, data, type) => {
    const container = document.getElementById(containerId); container.innerHTML = '';
    if(data.length === 0) { container.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-theme-muted opacity-50"><i class="ph ph-receipt text-3xl mb-2"></i><p class="text-[9px] font-black uppercase tracking-widest">Tidak ada data</p></div>`; return; }
    
    data.forEach(m => {
        const catObj = categories.find(c => c.name === m.category); 
        const color = catObj ? catObj.color : '#64748b'; 
        const isSystem = m.category === 'Setoran' || m.category === 'Pindah ke Brankas' || m.category === 'Cairkan dari Brankas';
        const textColorClass = type === 'income' ? 'text-emerald-500' : 'text-rose-500';
        
        let bulkHtml = '';
        if (m.bulkData && m.bulkData.length > 0) {
            bulkHtml = `
            <div class="mt-3">
                <button onclick="window.toggleBulkAccordion('${m.id}')" class="flex items-center space-x-1 text-[9px] font-bold text-theme-muted hover:text-theme-text transition-colors">
                    <i id="bulk-icon-${m.id}" class="ph ph-caret-down transition-transform"></i><span>Lihat Detail Nota (${m.bulkData.length} Item)</span>
                </button>
                <div id="bulk-acc-${m.id}" class="hidden mt-2 pt-2 border-t border-theme-border/50 text-[9px] space-y-1">`;
            m.bulkData.forEach(b => { bulkHtml += `<div class="flex justify-between text-theme-muted"><span>- ${b.name}</span><span class="font-bold">${formatRp(b.price)}</span></div>`; });
            bulkHtml += `</div></div>`;
        }

        let btnEdit = '', btnDel = '';
        if(!isSystem) {
            btnEdit = `<button onclick="window.editMutation('${m.id}')" class="w-7 h-7 bg-theme-bg border border-theme-border text-theme-muted hover:text-blue-500 hover:border-blue-500 rounded-lg flex items-center justify-center transition-colors"><i class="ph ph-pencil-simple"></i></button>`;
            btnDel = `<button onclick="window.deleteMutation('${m.id}')" class="w-7 h-7 bg-theme-bg border border-theme-border text-theme-muted hover:text-rose-500 hover:border-rose-500 rounded-lg flex items-center justify-center transition-colors"><i class="ph ph-trash"></i></button>`;
        } else if (m.category === 'Setoran') {
            btnEdit = `<button onclick="window.editMutation('${m.id}', true)" class="w-7 h-7 bg-theme-bg border border-theme-border text-theme-muted hover:text-amber-500 hover:border-amber-500 rounded-lg flex items-center justify-center transition-colors" title="Edit Fisik"><i class="ph ph-pencil-simple"></i></button>`;
        }

        let archiveTag = m.isArchived ? `<span class="px-1.5 py-0.5 bg-theme-accent/20 text-theme-accent text-[8px] rounded uppercase font-black ml-2">Arsip</span>` : '';
        let editLabel = m.updatedAt ? `<br><span class="text-[8px] italic opacity-70 flex items-center mt-0.5"><i class="ph ph-pencil-simple mr-1"></i>Diedit: ${formatEditTime(m.updatedAt)}</span>` : '';

        container.innerHTML += `
            <div class="p-3 mb-2 bg-theme-card border border-theme-border rounded-2xl flex flex-col justify-between group hover:border-theme-accent/50 transition-colors relative overflow-hidden shadow-sm">
                ${isSystem ? `<div class="absolute -right-2 -top-2 text-theme-muted/10 text-4xl"><i class="ph ph-lock-key"></i></div>` : ''}
                <div class="flex justify-between items-start mb-2 relative z-10">
                    <div>
                        <span class="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded text-white shadow-sm" style="background-color: ${color}">${m.category}</span>
                        ${archiveTag}
                        <p class="text-[9px] font-bold text-theme-muted mt-1">${m.date.split('-').reverse().join('/')}</p>
                    </div>
                    <div class="flex space-x-1">${btnEdit}${btnDel}</div>
                </div>
                <div class="relative z-10">
                    <h4 class="text-xs font-bold text-theme-text">${m.description}${editLabel}</h4>
                    <div class="mt-1 text-sm font-black ${textColorClass} tracking-tight drop-shadow-sm pb-1 leading-tight overflow-visible">${formatRp(m.amount)}</div>
                </div>
                ${bulkHtml}
            </div>`;
    });
};

window.deleteMutation = (id) => {
    window.showConfirmModal('Pindah ke Sampah', 'Data akan dipindahkan ke keranjang sampah dan bisa dipulihkan dalam 2 hari.', async () => {
        await updateDoc(getPosDoc("finance_mutations", id), { isDeleted: true, deletedAt: new Date().toISOString() }); showToast("Data dipindah ke sampah.");
    });
};

window.openExpenseModal = () => {
    document.getElementById('exp-id').value = ''; document.getElementById('expense-modal-title').innerHTML = '<i class="ph ph-arrow-up-right mr-2 text-lg"></i> Catat Pengeluaran';
    document.getElementById('exp-date').value = getTodayYMD(); document.getElementById('exp-desc').value = ''; document.getElementById('exp-amount').value = '';
    document.getElementById('exp-bulk-title').value = '';
    window.setExpenseMode('single'); document.getElementById('expense-modal').classList.remove('hidden');
};

window.setExpenseMode = (mode) => {
    expenseMode = mode;
    if(mode === 'single') {
        document.getElementById('btn-mode-single').className = "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-rose-500 text-white transition-colors shadow-sm";
        document.getElementById('btn-mode-bulk').className = "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-theme-bg text-theme-muted border border-theme-border hover:border-rose-500 transition-colors";
        document.getElementById('exp-single-container').classList.remove('hidden'); document.getElementById('exp-bulk-container').classList.add('hidden');
        document.getElementById('exp-amount').required = true; document.getElementById('exp-desc').required = true;
        document.getElementById('exp-bulk-title').required = false;
    } else {
        document.getElementById('btn-mode-bulk').className = "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-rose-500 text-white transition-colors shadow-sm";
        document.getElementById('btn-mode-single').className = "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-theme-bg text-theme-muted border border-theme-border hover:border-rose-500 transition-colors";
        document.getElementById('exp-bulk-container').classList.remove('hidden'); document.getElementById('exp-single-container').classList.add('hidden');
        document.getElementById('exp-amount').required = false; document.getElementById('exp-desc').required = false;
        document.getElementById('exp-bulk-title').required = true;
        if(bulkItems.length === 0 || bulkItems[0].name === undefined) bulkItems = [{name: '', price: ''}];
        renderBulkRows();
    }
};

window.addBulkRow = () => { 
    saveBulkInputValues();
    bulkItems.push({name: '', price: ''}); 
    renderBulkRows(); 
};

window.removeBulkRow = (idx) => { 
    saveBulkInputValues();
    bulkItems.splice(idx, 1); 
    if(bulkItems.length===0) bulkItems=[{name:'', price:''}]; 
    renderBulkRows(); 
};

const saveBulkInputValues = () => {
    const tbody = document.getElementById('exp-bulk-tbody');
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row, idx) => {
        const nameInput = row.querySelector('.bulk-name-input');
        const priceInput = row.querySelector('.bulk-price-input');
        if(bulkItems[idx]) {
            if (nameInput) bulkItems[idx].name = nameInput.value;
            if (priceInput) bulkItems[idx].price = priceInput.value.replace(/\./g, '');
        }
    });
};

const renderBulkRows = () => {
    const tbody = document.getElementById('exp-bulk-tbody'); tbody.innerHTML = '';
    bulkItems.forEach((b, idx) => {
        const priceFormatted = b.price ? parseInt(b.price.toString().replace(/\./g, '')).toLocaleString('id-ID') : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-1"><input type="text" placeholder="Nama..." value="${b.name}" class="bulk-name-input w-full bg-theme-bg border border-theme-border rounded-lg px-2 py-2 text-[10px] text-theme-text outline-none focus:border-rose-500 shadow-inner transition-colors"></td>
            <td class="p-1"><input type="text" placeholder="0" value="${priceFormatted}" class="bulk-price-input w-full bg-theme-bg border border-theme-border rounded-lg px-2 py-2 text-[10px] text-theme-text font-black outline-none focus:border-rose-500 text-right no-spinners shadow-inner transition-colors"></td>
            <td class="p-1 text-center"><button type="button" onclick="window.removeBulkRow(${idx})" class="w-6 h-6 bg-theme-bg text-rose-500 rounded-lg flex items-center justify-center border border-theme-border hover:bg-rose-500 hover:text-white transition-colors shadow-sm"><i class="ph ph-trash"></i></button></td>
        `;
        const nameInput = tr.querySelector('.bulk-name-input');
        nameInput.addEventListener('input', (e) => { bulkItems[idx].name = e.target.value; });

        const priceInput = tr.querySelector('.bulk-price-input');
        priceInput.addEventListener('input', (e) => {
            window.formatCurrencyInput(e.target);
            bulkItems[idx].price = e.target.value.replace(/\./g, '');
            calculateBulkTotal();
        });
        tbody.appendChild(tr);
    });
    calculateBulkTotal();
};

const calculateBulkTotal = () => {
    let tot = 0; 
    bulkItems.forEach(b => { 
        let p = b.price ? b.price.toString().replace(/\./g, '') : 0;
        tot += (parseFloat(p) || 0); 
    });
    document.getElementById('exp-bulk-total').innerText = formatRp(tot);
    return tot;
};

document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault(); if(!isAuthReady) return;
    const btn = document.getElementById('btn-submit-expense'); const origText = btn.innerHTML; btn.innerText = "Simpan..."; btn.disabled = true;
    try {
        const id = document.getElementById('exp-id').value;
        const payload = {
            type: 'expense', date: document.getElementById('exp-date').value,
            category: document.getElementById('exp-category').value,
            isDeleted: false,
            isArchived: false
        };
        if(expenseMode === 'single') {
            payload.amount = parseCurrencyStr(document.getElementById('exp-amount').value);
            payload.description = document.getElementById('exp-desc').value;
            payload.bulkData = [];
        } else {
            saveBulkInputValues();
            payload.amount = calculateBulkTotal();
            payload.bulkData = bulkItems.filter(b => b.name.trim() !== '' && (parseFloat(b.price)>0));
            payload.description = document.getElementById('exp-bulk-title').value || "Nota Bulk";
            if(payload.bulkData.length === 0) throw new Error("Isi minimal 1 rincian nota yang valid!");
        }
        
        if(id) {
            payload.updatedAt = new Date().toISOString();
            await updateDoc(getPosDoc("finance_mutations", id), payload);
        } else {
            payload.createdAt = new Date().toISOString();
            await addDoc(getPosCol("finance_mutations"), payload);
        }
        showToast("Pengeluaran tersimpan!", "success"); window.closeModal('expense-modal');
    } catch (err) { showToast(err.message, 'error'); } finally { btn.innerHTML = origText; btn.disabled = false; }
});

window.openIncomeModal = () => {
    document.getElementById('inc-id').value = ''; document.getElementById('income-modal-title').innerHTML = '<i class="ph ph-arrow-down-left mr-2 text-lg"></i> Pemasukan Manual';
    document.getElementById('inc-date').value = getTodayYMD(); document.getElementById('inc-desc').value = ''; document.getElementById('inc-amount').value = '';
    document.getElementById('income-modal').classList.remove('hidden');
};

document.getElementById('income-form').addEventListener('submit', async (e) => {
    e.preventDefault(); if(!isAuthReady) return;
    const btn = document.getElementById('btn-submit-income'); const origText = btn.innerHTML; btn.innerText = "Simpan..."; btn.disabled = true;
    try {
        const id = document.getElementById('inc-id').value;
        const payload = {
            type: 'income', date: document.getElementById('inc-date').value,
            category: document.getElementById('inc-category').value,
            amount: parseCurrencyStr(document.getElementById('inc-amount').value),
            description: document.getElementById('inc-desc').value,
            isDeleted: false,
            isArchived: false
        };
        if(id) {
            payload.updatedAt = new Date().toISOString();
            await updateDoc(getPosDoc("finance_mutations", id), payload);
        } else {
            payload.createdAt = new Date().toISOString();
            await addDoc(getPosCol("finance_mutations"), payload);
        }
        showToast("Pemasukan tersimpan!", "success"); window.closeModal('income-modal');
    } catch(err) { showToast("Gagal menyimpan.", "error"); } finally { btn.innerHTML = origText; btn.disabled = false; }
});

window.editMutation = (id, isSetoran = false) => {
    const m = mutations.find(x => x.id === id); if(!m) return;
    if(m.type === 'expense') {
        document.getElementById('exp-id').value = m.id; document.getElementById('expense-modal-title').innerHTML = '<i class="ph ph-pencil-simple mr-2 text-lg"></i> Edit Pengeluaran';
        document.getElementById('exp-date').value = m.date; document.getElementById('exp-category').value = m.category;
        if(m.bulkData && m.bulkData.length > 0) { 
            window.setExpenseMode('bulk'); 
            document.getElementById('exp-bulk-title').value = m.description;
            bulkItems = JSON.parse(JSON.stringify(m.bulkData)); 
            renderBulkRows(); 
        }
        else { 
            window.setExpenseMode('single'); 
            document.getElementById('exp-amount').value = m.amount.toLocaleString('id-ID'); 
            document.getElementById('exp-desc').value = m.description; 
        }
        document.getElementById('expense-modal').classList.remove('hidden');
    } else if (m.type === 'income') {
        document.getElementById('inc-id').value = m.id; document.getElementById('income-modal-title').innerHTML = '<i class="ph ph-pencil-simple mr-2 text-lg"></i> Edit Pemasukan';
        document.getElementById('inc-date').value = m.date; 
        
        if(isSetoran) {
            const sel = document.getElementById('inc-category');
            if(![...sel.options].some(o=>o.value==='Setoran')) sel.innerHTML += `<option value="Setoran">Setoran</option>`;
            sel.value = 'Setoran'; sel.disabled = true;
        } else {
            document.getElementById('inc-category').value = m.category; document.getElementById('inc-category').disabled = false;
        }
        
        document.getElementById('inc-amount').value = m.amount.toLocaleString('id-ID'); document.getElementById('inc-desc').value = m.description;
        document.getElementById('income-modal').classList.remove('hidden');
    }
};

const renderBrankas = () => {
    let total = 0; const tbody = document.getElementById('brankas-table-body'); tbody.innerHTML = '';
    brankasData.forEach(b => {
        let catClass = '', sign = '', name = '';
        let amount = parseFloat(b.amount) || 0;
        
        if(b.type === 'in_from_kas') { catClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'; sign = '+'; name = 'Dari Kas'; total += amount; }
        else if(b.type === 'in_external') { catClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'; sign = '+'; name = 'Dana Luar'; total += amount; }
        else if(b.type === 'out_to_kas') { catClass = 'bg-blue-500/10 text-blue-500 border-blue-500/20'; sign = '-'; name = 'Cair ke Kas'; total -= amount; }
        else { catClass = 'bg-slate-500/10 text-slate-500 border-slate-500/20'; sign = '+'; name = 'Lainnya'; total += amount; }

        let editLabel = b.updatedAt ? `<br><span class="text-[8px] italic opacity-70 flex items-center mt-0.5"><i class="ph ph-pencil-simple mr-1"></i>Diedit: ${formatEditTime(b.updatedAt)}</span>` : '';

        tbody.innerHTML += `
            <tr class="border-b border-theme-border hover:bg-theme-bg/80 even:bg-theme-bg/30 transition-colors">
                <td class="p-4 font-black text-theme-text text-[10px]">${b.date ? b.date.split('-').reverse().join('/') : '-'}</td>
                <td class="p-4"><span class="px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border shadow-sm ${catClass}">${name}</span></td>
                <td class="p-4 text-xs font-bold text-theme-muted">${b.description || '-'}${editLabel}</td>
                <td class="p-4 text-right font-black ${sign==='+'?'text-emerald-500':'text-blue-500'} tracking-tight">${sign} ${formatRp(amount)}</td>
                <td class="p-4">
                    <div class="flex items-center justify-center space-x-2">
                        <button onclick="window.editBrankas('${b.id}')" class="w-7 h-7 bg-theme-bg border border-theme-border text-theme-muted hover:text-amber-500 hover:border-amber-500 rounded-lg flex items-center justify-center transition-colors shadow-sm"><i class="ph ph-pencil-simple"></i></button>
                        <button onclick="window.deleteBrankas('${b.id}')" class="w-7 h-7 bg-theme-bg border border-theme-border text-theme-muted hover:text-rose-500 hover:border-rose-500 rounded-lg flex items-center justify-center transition-colors shadow-sm"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            </tr>`;
    });
    document.getElementById('total-brankas-display').innerText = formatRp(total);
    document.getElementById('dash-brankas').innerText = formatRp(total); 
};

window.openBrankasModal = (type, editData = null) => {
    const t = document.getElementById('brankas-modal-title'); const info = document.getElementById('brankas-info');
    document.getElementById('brankas-type').value = type;
    document.getElementById('brankas-id').value = editData ? editData.id : '';
    
    document.getElementById('brankas-date').value = editData ? editData.date : getTodayYMD();
    document.getElementById('brankas-amount').value = editData ? parseFloat(editData.amount).toLocaleString('id-ID') : '';
    document.getElementById('brankas-desc').value = editData ? editData.description : '';

    let prefix = editData ? "[EDIT] " : "";
    if(type === 'in_from_kas') { t.innerHTML = `<i class="ph ph-download-simple mr-2 text-lg text-emerald-500"></i> ${prefix}Pindah Kas ke Brankas`; info.innerText = "Uang Kas Usaha akan BERKURANG, saldo Brankas akan BERTAMBAH."; }
    else if(type === 'out_to_kas') { t.innerHTML = `<i class="ph ph-upload-simple mr-2 text-lg text-blue-500"></i> ${prefix}Cairkan ke Kas`; info.innerText = "Saldo Brankas akan BERKURANG, uang Kas Usaha akan BERTAMBAH."; }
    else { t.innerHTML = `<i class="ph ph-plus-circle mr-2 text-lg text-slate-500"></i> ${prefix}Suntikan Dana Luar`; info.innerText = "Hanya saldo Brankas yang BERTAMBAH. Tidak mempengaruhi Kas Usaha."; document.getElementById('brankas-type').value = 'in_external';} 
    document.getElementById('brankas-modal').classList.remove('hidden');
};

window.editBrankas = (id) => { const b = brankasData.find(x => x.id === id); if(b) window.openBrankasModal(b.type || 'in_external', b); };

window.deleteBrankas = (id) => {
    window.showConfirmModal('Hapus Riwayat Brankas', 'Yakin ingin menghapus data ini? Saldo kas akan menyesuaikan kembali jika berhubungan.', async () => {
        try {
            const mLink = mutations.find(m => m.sourceId === 'brankas_'+id);
            if(mLink) { await updateDoc(getPosDoc("finance_mutations", mLink.id), { isDeleted: true, deletedAt: new Date().toISOString() }); }
            await deleteDoc(getPosDoc("finance_brankas", id));
            showToast("Transaksi brankas berhasil dihapus", "success");
        } catch(e) { showToast(e.message, 'error'); }
    });
};

document.getElementById('brankas-form').addEventListener('submit', async (e) => {
    e.preventDefault(); if(!isAuthReady) return;
    const btn = document.getElementById('btn-submit-brankas'); const origText = btn.innerHTML; btn.innerText = "Proses..."; btn.disabled = true;
    try {
        const id = document.getElementById('brankas-id').value;
        const type = document.getElementById('brankas-type').value;
        const amount = parseCurrencyStr(document.getElementById('brankas-amount').value);
        const date = document.getElementById('brankas-date').value;
        const desc = document.getElementById('brankas-desc').value;

        let title = type === 'in_from_kas' ? 'Pindah ke Brankas' : (type === 'out_to_kas' ? 'Cairkan dari Brankas' : 'Suntikan Dana Luar');
        const bPayload = { type: type, date: date, amount: amount, description: desc };
        const dtNow = new Date().toISOString();

        if (id) {
            bPayload.updatedAt = dtNow;
            await updateDoc(getPosDoc("finance_brankas", id), bPayload);
            const mLink = mutations.find(m => m.sourceId === 'brankas_'+id);
            if(mLink) { await updateDoc(getPosDoc("finance_mutations", mLink.id), { date: date, amount: amount, description: title + (desc ? ' - ' + desc : ''), updatedAt: dtNow }); }
        } else {
            bPayload.createdAt = dtNow;
            const docRef = await addDoc(getPosCol("finance_brankas"), bPayload);
            if (type === 'in_from_kas') {
                await addDoc(getPosCol("finance_mutations"), { type: 'expense', date: date, category: 'Pindah ke Brankas', amount: amount, description: title + (desc ? ' - ' + desc : ''), sourceId: 'brankas_'+docRef.id, isDeleted: false, isArchived: false, createdAt: dtNow });
            } else if (type === 'out_to_kas') {
                await addDoc(getPosCol("finance_mutations"), { type: 'income', date: date, category: 'Cairkan dari Brankas', amount: amount, description: title + (desc ? ' - ' + desc : ''), sourceId: 'brankas_'+docRef.id, isDeleted: false, isArchived: false, createdAt: dtNow });
            }
        }
        showToast("Transaksi Brankas Berhasil", "success"); window.closeModal('brankas-modal');
    } catch(e) { showToast(e.message, 'error'); } finally { btn.innerHTML = origText; btn.disabled = false; }
});

const renderCategories = () => {
    const incList = document.getElementById('cat-income-list'); const expList = document.getElementById('cat-expense-list');
    incList.innerHTML = ''; expList.innerHTML = '';
    
    categories.forEach(c => {
        let delBtn = c.isSystem ? '' : `<button onclick="window.deleteCategory('${c.id}')" class="text-rose-500 hover:text-rose-400"><i class="ph ph-trash"></i></button>`;
        let lockIcon = c.isSystem ? `<i class="ph ph-lock-key text-theme-muted" title="Sistem (Tidak bisa dihapus)"></i>` : '';
        const html = `<div class="flex items-center justify-between p-3 bg-theme-bg border border-theme-border rounded-xl shadow-sm"><div class="flex items-center space-x-3"><span class="w-3 h-3 rounded-full shadow-sm" style="background-color: ${c.color}"></span><span class="text-xs font-black text-theme-text uppercase tracking-widest">${c.name}</span></div><div class="flex space-x-2">${lockIcon}${delBtn}</div></div>`;
        if(c.type === 'income') incList.innerHTML += html; else expList.innerHTML += html;
    });
};

const updateCategoryDropdowns = () => {
    const incSel = document.getElementById('inc-category'); const expSel = document.getElementById('exp-category');
    const fIncSel = document.getElementById('filter-income-cat'); const fExpSel = document.getElementById('filter-expense-cat');
    
    if(incSel) { incSel.innerHTML = ''; categories.filter(c => c.type === 'income' && !c.isSystem).forEach(c => incSel.innerHTML += `<option value="${c.name}">${c.name}</option>`); }
    if(expSel) { expSel.innerHTML = ''; categories.filter(c => c.type === 'expense' && !c.isSystem).forEach(c => expSel.innerHTML += `<option value="${c.name}">${c.name}</option>`); }
    
    if(fIncSel) { fIncSel.innerHTML = '<option value="ALL">Semua Kategori</option>'; categories.filter(c => c.type === 'income').forEach(c => fIncSel.innerHTML += `<option value="${c.name}">${c.name}</option>`); }
    if(fExpSel) { fExpSel.innerHTML = '<option value="ALL">Semua Kategori</option>'; categories.filter(c => c.type === 'expense').forEach(c => fExpSel.innerHTML += `<option value="${c.name}">${c.name}</option>`); }
};

window.openCategoryModal = (type) => {
    document.getElementById('cat-type').value = type; document.getElementById('cat-modal-title').innerText = type === 'income' ? 'Tambah Kat. Pemasukan' : 'Tambah Kat. Pengeluaran';
    document.getElementById('cat-name').value = ''; window.selectCatColor('#3b82f6'); document.getElementById('category-modal').classList.remove('hidden');
};

window.selectCatColor = (color) => {
    document.getElementById('cat-color').value = color;
    document.querySelectorAll('.color-option').forEach(el => { 
        el.innerHTML = ''; el.style.boxShadow = ''; el.classList.remove('scale-110');
        if(el.dataset.color === color) {
            el.classList.add('scale-110');
            el.style.boxShadow = `0 0 0 2px var(--bg-color), 0 0 0 4px ${color}`;
            el.innerHTML = '<i class="ph ph-check text-white font-bold drop-shadow-md"></i>';
        }
    });
};

document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault(); if(!isAuthReady) return; const btn = document.getElementById('btn-submit-cat'); const origText = btn.innerHTML; btn.innerText = "Simpan..."; btn.disabled = true;
    try {
        const name = document.getElementById('cat-name').value;
        if(categories.some(c => c.name.toLowerCase() === name.toLowerCase())) throw new Error("Nama kategori sudah ada!");
        await addDoc(getPosCol("finance_categories"), { name: name, type: document.getElementById('cat-type').value, color: document.getElementById('cat-color').value });
        showToast("Kategori ditambahkan", "success"); window.closeModal('category-modal');
    } catch(e) { showToast(e.message, 'error'); } finally { btn.innerHTML = origText; btn.disabled = false; }
});

window.deleteCategory = (id) => { window.showConfirmModal('Hapus Kategori', 'Yakin ingin menghapus?', async () => { await deleteDoc(getPosDoc("finance_categories", id)); showToast("Kategori dihapus"); }); };

const renderTrashTable = () => {
    const tbody = document.getElementById('trash-table-body'); tbody.innerHTML = '';
    trashMutations.forEach(m => {
        const typeClass = m.type === 'income' ? 'text-emerald-500' : 'text-rose-500'; const typeSign = m.type === 'income' ? '+' : '-';
        tbody.innerHTML += `
            <tr class="border-b border-theme-border hover:bg-theme-bg/80 even:bg-theme-bg/30 transition-colors">
                <td class="p-4 font-black text-theme-muted text-[10px]">${m.deletedAt.substring(0,10).split('-').reverse().join('/')}</td>
                <td class="p-4">
                    <span class="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest bg-theme-bg border border-theme-border rounded text-theme-muted shadow-sm">${m.category}</span>
                    <p class="text-[10px] font-bold text-theme-text mt-1">${m.description}</p>
                </td>
                <td class="p-4 text-right font-black ${typeClass} tracking-tight">${typeSign} ${formatRp(m.amount)}</td>
                <td class="p-4 text-center">
                    <button onclick="window.restoreMutation('${m.id}')" class="px-3 py-1.5 bg-theme-bg border border-theme-border text-theme-muted hover:text-emerald-500 hover:border-emerald-500 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors shadow-sm"><i class="ph ph-arrow-counter-clockwise mr-1"></i> Pulihkan</button>
                </td>
            </tr>`;
    });
};

window.restoreMutation = async (id) => { await updateDoc(getPosDoc("finance_mutations", id), { isDeleted: false }); showToast("Data dipulihkan!", "success"); };

window.showConfirmModal = (title, msg, onConfirm) => {
    document.getElementById('confirm-title').innerText = title; document.getElementById('confirm-msg').innerText = msg;
    const btn = document.getElementById('btn-confirm-action'); const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
    newBtn.onclick = async () => { window.closeModal('confirm-modal'); await onConfirm(); }; document.getElementById('confirm-modal').classList.remove('hidden');
};

window.renderTbNotes = () => {
    const list = document.getElementById('tb-notes-list');
    list.innerHTML = '';
    window.tempTbNotes.forEach((note, idx) => {
        list.innerHTML += `
        <li class="flex items-start justify-between bg-theme-card p-2 rounded border border-theme-border text-[10px] text-theme-text group shadow-sm">
            <span><i class="ph ph-caret-right text-theme-accent mr-1"></i> ${note}</span>
            <button type="button" onclick="window.removeTbNote(${idx})" class="text-theme-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="ph ph-trash"></i></button>
        </li>`;
    });
};

window.addTbNote = () => {
    const inp = document.getElementById('tb-new-note');
    if(inp.value.trim()) { window.tempTbNotes.push(inp.value.trim()); inp.value = ''; window.renderTbNotes(); }
};
window.removeTbNote = (idx) => { window.tempTbNotes.splice(idx, 1); window.renderTbNotes(); };

window.generateTutupBuku = () => {
    const sd = document.getElementById('tb-start').value; const ed = document.getElementById('tb-end').value;
    if(!sd || !ed) return showToast('Pilih rentang tanggal!', 'error');

    const start = new Date(sd).getTime(); const end = new Date(ed).getTime() + 86400000;
    let totIn = 0, totOut = 0; let catIn = {}, catOut = {};

    mutations.filter(m => !m.isDeleted && !m.isArchived).forEach(m => {
        const tTime = new Date(m.date).getTime();
        if(tTime >= start && tTime < end) {
            const amount = parseFloat(m.amount) || 0;
            if(m.type === 'income') { totIn += amount; catIn[m.category] = (catIn[m.category] || 0) + amount; }
            else { totOut += amount; catOut[m.category] = (catOut[m.category] || 0) + amount; }
        }
    });

    document.getElementById('tb-res-in').innerText = formatRp(totIn);
    document.getElementById('tb-res-out').innerText = formatRp(totOut);
    document.getElementById('tb-res-net').innerText = formatRp(totIn - totOut);
    document.getElementById('tb-result-container').classList.remove('hidden');

    renderTbCharts(catIn, catOut, 'tb-chart-in', 'tb-chart-out');
    
    window.tempArsipData = { startDate: sd, endDate: ed, totalIncome: totIn, totalExpense: totOut, netProfit: (totIn - totOut), notes: window.tempTbNotes };
    window.renderTbNotes();
};

const renderTbCharts = (catIn, catOut, incCanvasId, expCanvasId, isLib = false) => {
    const getCatColor = (name) => { const c = categories.find(x => x.name === name); return c ? c.color : '#64748b'; };
    
    if(!isLib) { if(tbChartInc) tbChartInc.destroy(); if(tbChartExp) tbChartExp.destroy(); }
    else { if(libChartInc) libChartInc.destroy(); if(libChartExp) libChartExp.destroy(); }

    const inLabels = Object.keys(catIn); const inData = Object.values(catIn); const inColors = inLabels.map(l => getCatColor(l));
    const outLabels = Object.keys(catOut); const outData = Object.values(catOut); const outColors = outLabels.map(l => getCatColor(l));
    
    const textColor = currentTheme === 'soft' ? '#1f2937' : '#f8fafc';
    const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 9, family: 'Inter', weight: 'bold' } } } } };

    const chInc = new Chart(document.getElementById(incCanvasId).getContext('2d'), { type: 'doughnut', data: { labels: inLabels, datasets: [{ data: inData, backgroundColor: inColors, borderWidth: 0 }] }, options: opts });
    const chExp = new Chart(document.getElementById(expCanvasId).getContext('2d'), { type: 'doughnut', data: { labels: outLabels, datasets: [{ data: outData, backgroundColor: outColors, borderWidth: 0 }] }, options: opts });

    if(!isLib) { tbChartInc = chInc; tbChartExp = chExp; } else { libChartInc = chInc; libChartExp = chExp; }
};

window.openArsipModal = () => {
    if(!window.tempArsipData) return;
    window.tempArsipData.notes = window.tempTbNotes;
    
    const startStr = window.tempArsipData.startDate.split('-').reverse().join('/'); const endStr = window.tempArsipData.endDate.split('-').reverse().join('/');
    document.getElementById('arsip-name').value = '';
    document.getElementById('arsip-periode-text').innerText = `${startStr} - ${endStr}`;
    document.getElementById('arsip-laba-text').innerText = formatRp(window.tempArsipData.netProfit);
    document.getElementById('arsip-modal').classList.remove('hidden');
};

document.getElementById('arsip-form').addEventListener('submit', async (e) => {
    e.preventDefault(); if(!isAuthReady) return;
    const btn = document.getElementById('btn-submit-arsip'); const origText = btn.innerHTML; btn.innerText = "Mengunci..."; btn.disabled = true;
    try {
        const name = document.getElementById('arsip-name').value;
        const archiveRef = await addDoc(getPosCol("finance_archives"), { name: name, timestamp: Date.now(), ...window.tempArsipData });
        const archiveId = archiveRef.id;

        const start = new Date(window.tempArsipData.startDate).getTime(); const end = new Date(window.tempArsipData.endDate).getTime() + 86400000;
        let mutToArchive = mutations.filter(m => { const t = new Date(m.date).getTime(); return t >= start && t < end && !m.isDeleted && !m.isArchived; });
        
        showLoading("Menyembunyikan & Mengunci Data...");
        for(let m of mutToArchive) { await updateDoc(getPosDoc("finance_mutations", m.id), { isArchived: true, archiveId: archiveId }); }
        hideLoading();

        showToast("Laporan Tersimpan & Terkunci!", "success"); window.closeModal('arsip-modal');
        document.getElementById('tb-result-container').classList.add('hidden');
        document.getElementById('tb-start').value = ''; document.getElementById('tb-end').value = '';
        window.tempTbNotes = [];
    } catch(e) { showToast(e.message, 'error'); hideLoading(); } finally { btn.innerHTML = origText; btn.disabled = false; }
});

const renderArchives = () => {
    const container = document.getElementById('library-list-container'); container.innerHTML = '';
    if(archivesData.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-10 text-theme-muted font-bold text-xs uppercase tracking-widest"><i class="ph ph-archive block text-3xl mb-2 opacity-50"></i>Belum ada laporan yang diarsipkan.</div>`;
        return;
    }
    archivesData.forEach(a => {
        let noteSnippet = a.notes && a.notes.length > 0 ? a.notes[0] : 'Tidak ada catatan...';
        
        container.innerHTML += `
            <div onclick="window.openArchiveDetail('${a.id}')" class="library-token bg-theme-bg p-5 rounded-2xl border border-theme-border shadow-sm flex flex-col justify-between cursor-pointer group">
                <div class="mb-4">
                    <span class="px-2.5 py-1 bg-theme-accent/20 text-theme-accent text-[8px] font-black uppercase tracking-widest rounded-lg mb-3 inline-block shadow-sm">Token Arsip</span>
                    <h4 class="text-xs font-black text-theme-text uppercase tracking-widest leading-tight group-hover:text-theme-accent transition-colors">${a.name}</h4>
                    <p class="text-[9px] font-bold text-theme-muted mt-1.5 flex items-center"><i class="ph ph-calendar-blank mr-1"></i>${a.startDate.split('-').reverse().join('/')} - ${a.endDate.split('-').reverse().join('/')}</p>
                </div>
                <div class="pt-3 border-t border-theme-border/50 flex justify-between items-end">
                    <div>
                        <p class="text-[8px] text-theme-muted font-bold uppercase tracking-widest mb-0.5">Laba / Rugi</p>
                        <h5 class="text-sm font-black text-theme-accent">${formatRp(a.netProfit)}</h5>
                    </div>
                    <div class="text-[10px] text-theme-muted italic truncate w-1/2 text-right">"${noteSnippet}"</div>
                </div>
            </div>`;
    });
};

window.openArchiveDetail = (archiveId) => {
    const a = archivesData.find(x => x.id === archiveId); if(!a) return;
    document.getElementById('current-library-id').value = a.id;
    document.getElementById('lib-title').innerText = a.name;
    document.getElementById('lib-date').innerText = `Periode: ${a.startDate.split('-').reverse().join('/')} - ${a.endDate.split('-').reverse().join('/')}`;
    
    document.getElementById('lib-res-in').innerText = formatRp(a.totalIncome);
    document.getElementById('lib-res-out').innerText = formatRp(a.totalExpense);
    document.getElementById('lib-res-net').innerText = formatRp(a.netProfit);

    const notesContainer = document.getElementById('lib-notes-list'); notesContainer.innerHTML = '';
    if(a.notes && a.notes.length > 0) {
        a.notes.forEach(n => { notesContainer.innerHTML += `<li class="flex items-start"><i class="ph ph-caret-right text-theme-accent mr-2 mt-0.5"></i> ${n}</li>`; });
    } else { notesContainer.innerHTML = `<li class="text-theme-muted italic">Tidak ada catatan untuk periode ini.</li>`; }

    const linkedMuts = mutations.filter(m => m.archiveId === a.id);
    let catIn = {}, catOut = {};
    const tbody = document.getElementById('lib-table-body'); tbody.innerHTML = '';
    
    linkedMuts.forEach(m => {
        const amount = parseFloat(m.amount) || 0;
        if(m.type === 'income') { catIn[m.category] = (catIn[m.category] || 0) + amount; }
        else { catOut[m.category] = (catOut[m.category] || 0) + amount; }

        const typeClass = m.type === 'income' ? 'text-emerald-500' : 'text-rose-500';
        const typeSign = m.type === 'income' ? '+' : '-';
        const catObj = categories.find(c => c.name === m.category); 
        const color = catObj ? catObj.color : '#64748b';

        tbody.innerHTML += `
            <tr class="border-b border-theme-border/50 hover:bg-theme-bg/50">
                <td class="p-4 font-black text-theme-muted text-[10px]">${m.date.split('-').reverse().join('/')}</td>
                <td class="p-4"><span class="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white rounded shadow-sm" style="background-color:${color}">${m.category}</span></td>
                <td class="p-4 text-[10px] font-bold text-theme-text">${m.description || '-'}</td>
                <td class="p-4 text-right font-black ${typeClass} tracking-tight">${typeSign} ${formatRp(m.amount)}</td>
            </tr>`;
    });
    if(linkedMuts.length === 0) tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-[10px] text-theme-muted font-bold uppercase">Data transaksi kosong/hilang</td></tr>`;

    renderTbCharts(catIn, catOut, 'lib-chart-in', 'lib-chart-out', true);
    document.getElementById('library-detail-modal').classList.remove('hidden');
    document.getElementById('library-detail-modal').classList.add('flex');
};

window.confirmDeleteArchive = () => {
    window.showConfirmModal('Hapus & Kembalikan Data', 'Hapus arsip ini? Semua data transaksi di dalamnya akan dikeluarkan dan KEMBALI ke Mutasi Kas.', async () => {
        const archiveId = document.getElementById('current-library-id').value;
        if(!archiveId) return;
        
        showLoading("Mengembalikan data mutasi...");
        try {
            const linkedMuts = mutations.filter(m => m.archiveId === archiveId);
            for(let m of linkedMuts) {
                await updateDoc(getPosDoc("finance_mutations", m.id), { isArchived: false, archiveId: null });
            }
            await deleteDoc(getPosDoc("finance_archives", archiveId));
            hideLoading();
            showToast("Laporan dihapus, data dikembalikan ke Mutasi Kas.", "success");
            window.closeModal('library-detail-modal');
        } catch(e) { hideLoading(); showToast(e.message, 'error'); }
    });
};

window.applyDashboardFilter = () => {
    let sd = document.getElementById('dash-start').value; let ed = document.getElementById('dash-end').value;
    if(!sd || !ed) { const dEnd = new Date(); const dStart = new Date(); dStart.setDate(dEnd.getDate() - 6); ed = dEnd.toISOString().split('T')[0]; sd = dStart.toISOString().split('T')[0]; document.getElementById('dash-start').value = sd; document.getElementById('dash-end').value = ed; }

    const dates = []; let currDate = new Date(sd); const endDate = new Date(ed);
    while(currDate <= endDate) { dates.push(currDate.toISOString().split('T')[0]); currDate.setDate(currDate.getDate() + 1); }

    const labels = []; const incomeData = []; const expenseData = []; 
    let totIn = 0, totOut = 0; let catOut = {};

    dates.forEach(dStr => {
        const parts = dStr.split('-'); labels.push(parts[2] + '/' + parts[1]);
        let dayIn = 0, dayOut = 0;
        mutations.filter(m => m.date === dStr && !m.isDeleted).forEach(m => {
            const amount = parseFloat(m.amount) || 0;
            if(m.type === 'income') { dayIn += amount; totIn += amount; }
            else { 
                dayOut += amount; totOut += amount; 
                catOut[m.category] = (catOut[m.category] || 0) + amount; 
            }
        });
        incomeData.push(dayIn); expenseData.push(dayOut);
    });

    document.getElementById('dash-tot-in').innerText = formatRp(totIn);
    document.getElementById('dash-tot-out').innerText = formatRp(totOut);
    document.getElementById('dash-net').innerText = formatRp(totIn - totOut);

    const getCatColor = (name) => { const c = categories.find(x => x.name === name); return c ? c.color : '#64748b'; };
    const textColor = currentTheme === 'soft' ? '#1f2937' : '#9ca3af';
    const gridColor = currentTheme === 'soft' ? '#e5e7eb' : '#333333';

    const catDetails = document.getElementById('dash-category-details');
    catDetails.innerHTML = '';
    if(Object.keys(catOut).length > 0) {
        const sortedCats = Object.keys(catOut).sort((a,b) => catOut[b] - catOut[a]);
        sortedCats.forEach(cat => {
            catDetails.innerHTML += `
                <div class="flex justify-between items-center bg-theme-bg p-3 rounded-xl border border-theme-border shadow-sm">
                    <span class="text-[10px] font-bold text-theme-text uppercase tracking-widest flex items-center">
                        <span class="w-3 h-3 rounded-full mr-2 shadow-sm" style="background-color: ${getCatColor(cat)}"></span>
                        ${cat}
                    </span>
                    <span class="text-xs font-black text-rose-500 tracking-tight">${formatRp(catOut[cat])}</span>
                </div>
            `;
        });
    } else {
        catDetails.innerHTML = `<div class="col-span-full text-[10px] text-theme-muted font-bold text-center py-6 bg-theme-bg rounded-xl border border-theme-border border-dashed">Belum ada data pengeluaran untuk periode ini.</div>`;
    }

    if(dashChartInc) dashChartInc.destroy();
    dashChartInc = new Chart(document.getElementById('chart-income').getContext('2d'), { 
        type: 'line', 
        data: { labels: labels, datasets: [ { label: 'Pemasukan', data: incomeData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 3, tension: 0.4, fill: true }, { label: 'Pengeluaran', data: expenseData, borderColor: '#f43f5e', backgroundColor: 'rgba(244, 63, 94, 0.1)', borderWidth: 2, borderDash: [5, 5], tension: 0.4, fill: true } ] }, 
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: textColor, font: { family: 'Inter', weight: 'bold' } } } }, scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, callback: function(val) { if(val >= 1000000) return (val/1000000).toFixed(1).replace('.0','') + 'Jt'; if(val >= 1000) return (val/1000) + 'Rb'; return val; } } }, x: { grid: { display: false }, ticks: { color: textColor } } } } 
    });

    const expLabels = Object.keys(catOut); const expData = Object.values(catOut); const expColors = expLabels.map(l => getCatColor(l));
    if(dashChartExp) dashChartExp.destroy();
    
    if(expLabels.length > 0) {
        document.getElementById('empty-expense-chart').classList.add('hidden');
        dashChartExp = new Chart(document.getElementById('chart-expense').getContext('2d'), { type: 'doughnut', data: { labels: expLabels, datasets: [{ data: expData, backgroundColor: expColors, borderWidth: 0 }] }, options: { layout: { padding: 10 }, responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 9, family: 'Inter', weight: 'bold' } } } } } });
    } else {
        document.getElementById('empty-expense-chart').classList.remove('hidden');
    }
};

const showLoading = (msg) => {
    const ls = document.getElementById('loading-screen');
    ls.querySelector('p').innerText = msg;
    ls.classList.remove('opacity-0', 'pointer-events-none');
};
const hideLoading = () => {
    const ls = document.getElementById('loading-screen');
    ls.classList.add('opacity-0'); setTimeout(() => ls.classList.add('pointer-events-none'), 500);
};

window.onload = () => { initAuth(); window.switchTab('dashboard'); };
