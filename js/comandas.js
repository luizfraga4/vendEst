/**
 * Módulo de Comandas (Consumo Aberto)
 * Sistema: VendEst PDV & Controle de Estoque
 */

class ComandasModule {
  constructor() {
    this.comandas = [];
    this.currentComanda = null;
    this.catalog = [];
    this.currentSort = 'recentes';
  }

  async init() {
    await this.loadComandas();
    await this.loadCatalog();
  }

  async loadCatalog() {
    try {
      this.catalog = await dbManager.listarProdutos();
    } catch (err) {
      console.error('Erro ao carregar catálogo para comandas:', err);
    }
  }

  async loadComandas() {
    try {
      this.comandas = await dbManager.listarComandas();
      this.renderComandasGrid();
    } catch (err) {
      console.error('Erro ao carregar comandas:', err);
    }
  }

  setSort(sortType) {
    this.currentSort = sortType || 'recentes';
    this.renderComandasGrid();
  }

  getSortedComandas() {
    const list = [...this.comandas];
    const sort = this.currentSort || 'recentes';

    if (sort === 'antigas') {
      list.sort((a, b) => {
        const timeA = a.dataCriacao ? new Date(a.dataCriacao).getTime() : (a.id || 0);
        const timeB = b.dataCriacao ? new Date(b.dataCriacao).getTime() : (b.id || 0);
        return timeA - timeB;
      });
    } else if (sort === 'nome') {
      list.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', undefined, { numeric: true, sensitivity: 'base' }));
    } else if (sort === 'valor') {
      list.sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
    } else {
      // 'recentes' (padrão decrescente por dataCriacao/id)
      list.sort((a, b) => {
        const timeA = a.dataCriacao ? new Date(a.dataCriacao).getTime() : (a.id || 0);
        const timeB = b.dataCriacao ? new Date(b.dataCriacao).getTime() : (b.id || 0);
        return timeB - timeA;
      });
    }
    return list;
  }

  async criarComanda() {
    const nome = prompt("Digite o nome do cliente ou número da mesa:");
    if (!nome || !nome.trim()) return;

    const novaComanda = {
      nome: nome.trim(),
      itens: [],
      total: 0,
      status: 'aberta',
      dataCriacao: new Date().toISOString()
    };

    try {
      await dbManager.salvarComanda(novaComanda);
      showToast(`Comanda "${nome}" aberta.`, 'success');
      await this.loadComandas();
    } catch (err) {
      console.error(err);
      showToast('Erro ao criar comanda', 'error');
    }
  }

  async excluirComandaComAlcada(id) {
    const comanda = this.comandas.find(c => Number(c.id) === Number(id));
    if (!comanda) return;

    const executeDeletion = async () => {
      try {
        await dbManager.excluirComanda(id);
        if (this.currentComanda && Number(this.currentComanda.id) === Number(id)) {
          this.fecharModalComanda();
        }
        await this.loadComandas();
        showToast(`Comanda "${comanda.nome}" excluída com sucesso.`, 'success');
      } catch (err) {
        console.error('Erro ao excluir comanda:', err);
        showToast('Erro ao excluir comanda.', 'error');
      }
    };

    const isUserAdmin = window.authModule && window.authModule.currentUser === 'admin';

    if (isUserAdmin) {
      if (confirm(`Deseja realmente excluir a comanda "${comanda.nome}"?`)) {
        await executeDeletion();
      }
    } else {
      // OPERADOR: exige senha de Administrador via modal
      if (window.authModule && typeof window.authModule.requireAdmin === 'function') {
        window.authModule.requireAdmin(async () => {
          await executeDeletion();
        });
      } else {
        if (confirm(`Deseja realmente excluir a comanda "${comanda.nome}"?`)) {
          await executeDeletion();
        }
      }
    }
  }

  renderComandasGrid() {
    const grid = document.getElementById('comandas-grid');
    if (!grid) return;

    if (this.comandas.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center text-slate-400 py-10">
          <i class="fa-solid fa-clipboard-list text-4xl mb-3"></i>
          <p>Nenhuma comanda aberta no momento.</p>
        </div>
      `;
      return;
    }

    const sortedList = this.getSortedComandas();

    grid.innerHTML = sortedList.map(c => {
      const dataStr = c.dataCriacao ? new Date(c.dataCriacao).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '-';
      const totalVal = Number(c.total) || 0;
      const qtdItens = Array.isArray(c.itens) ? c.itens.length : 0;

      return `
        <div class="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-lg flex flex-col justify-between cursor-pointer hover:bg-slate-700 transition-colors relative group" onclick="comandasModule.abrirComanda(${c.id})">
          <div>
            <div class="flex justify-between items-start">
              <h3 class="font-bold text-lg text-slate-100 pr-6 break-words">${c.nome}</h3>
              <button onclick="event.stopPropagation(); comandasModule.excluirComandaComAlcada(${c.id})" class="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer" title="Excluir Comanda">
                <i class="fa-solid fa-trash-can text-sm"></i>
              </button>
            </div>
            <p class="text-xs text-slate-400 mt-1">Criada: ${dataStr}</p>
            <p class="text-xs text-slate-400 mt-2">${qtdItens} itens lançados</p>
          </div>
          <div class="mt-4 pt-3 border-t border-slate-700 flex justify-between items-center">
            <span class="text-emerald-400 font-bold text-xl">R$ ${totalVal.toFixed(2)}</span>
            <i class="fa-solid fa-arrow-right text-indigo-400"></i>
          </div>
        </div>
      `;
    }).join('');
  }

  abrirComanda(id) {
    this.currentComanda = this.comandas.find(c => c.id === id);
    if (!this.currentComanda) return;

    const modal = document.getElementById('modal-comanda-detail');
    if (modal) {
      document.getElementById('comanda-detail-title').textContent = `Comanda: ${this.currentComanda.nome}`;
      
      const notesContainer = document.getElementById('comanda-modal-notes-container');
      const notesText = document.getElementById('comanda-modal-notes-text');
      if (notesContainer && notesText) {
        if (this.currentComanda.observacao) {
          notesText.textContent = this.currentComanda.observacao;
          notesContainer.classList.remove('hidden');
        } else {
          notesContainer.classList.add('hidden');
        }
      }

      this.renderComandaItens();
      modal.classList.remove('hidden');
      setTimeout(() => document.getElementById('comanda-barcode-input').focus(), 100);
    }
  }

  fecharModalComanda() {
    const modal = document.getElementById('modal-comanda-detail');
    if (modal) modal.classList.add('hidden');
    this.currentComanda = null;
    this.hideSearchResults();
  }

  async handleBarcodeScan(query) {
    if (!this.currentComanda) return;
    const trimmed = String(query || '').trim();
    if (!trimmed) return;

    try {
      const q = trimmed.toLowerCase();
      let product = this.catalog.find(p => String(p.codigo || p.code || '').trim().toLowerCase() === q);

      if (!product) {
        const matches = this.catalog.filter(p => (p.nome || p.name || '').toLowerCase().includes(q));
        if (matches.length === 1) {
          product = matches[0];
        } else if (matches.length > 1) {
          this.renderSearchResults(trimmed);
          return;
        }
      }

      if (product) {
        const qtyInput = document.getElementById('comanda-item-qty');
        const qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
        await this.adicionarItem(product, qty);
        
        const scanInput = document.getElementById('comanda-barcode-input');
        if (scanInput) scanInput.value = '';
        if (qtyInput) qtyInput.value = '1';
        this.hideSearchResults();
      } else {
        showToast(`Produto não encontrado.`, 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async renderSearchResults(query) {
    const resultsContainer = document.getElementById('comanda-search-results');
    if (!resultsContainer) return;

    const trimmed = String(query || '').trim();
    if (trimmed.length < 1) {
      this.hideSearchResults();
      return;
    }

    const q = trimmed.toLowerCase();
    const filtered = this.catalog.filter(p => {
      return (p.nome || p.name || '').toLowerCase().includes(q) || String(p.codigo || p.code || '').toLowerCase().includes(q);
    }).slice(0, 8);

    if (filtered.length === 0) {
      resultsContainer.innerHTML = `<div class="p-3 text-center text-xs text-slate-400 font-medium">Nenhum produto encontrado.</div>`;
      resultsContainer.classList.remove('hidden');
      return;
    }

    resultsContainer.innerHTML = filtered.map(p => `
      <div onclick="comandasModule.selectSearchResult(${p.id})" class="flex items-center justify-between p-3 hover:bg-slate-700/90 cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors">
        <div>
          <p class="font-semibold text-sm text-slate-100">${p.nome || p.name || ''}</p>
          <p class="text-xs text-slate-400 font-mono">Estoque: ${p.quantidade || p.estoque || 0} un</p>
        </div>
        <span class="font-bold text-emerald-400 text-sm">R$ ${parseFloat(p.precoVenda || 0).toFixed(2)}</span>
      </div>
    `).join('');

    resultsContainer.classList.remove('hidden');
  }

  hideSearchResults() {
    const container = document.getElementById('comanda-search-results');
    if (container) container.classList.add('hidden');
  }

  selectSearchResult(productId) {
    const product = this.catalog.find(p => Number(p.id) === Number(productId));
    if (product) {
      const qtyInput = document.getElementById('comanda-item-qty');
      const qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
      this.adicionarItem(product, qty);
      
      const scanInput = document.getElementById('comanda-barcode-input');
      if (scanInput) scanInput.value = '';
      if (qtyInput) qtyInput.value = '1';
      this.hideSearchResults();
      document.getElementById('comanda-barcode-input').focus();
    }
  }

  async adicionarItem(product, qtyToAdd = 1) {
    if (!this.currentComanda) return;
    const qty = parseInt(qtyToAdd, 10) || 1;
    
    const precoVenda = parseFloat(product.precoVenda || product.sellPrice || 0);
    const existingIndex = this.currentComanda.itens.findIndex(item => item.id === product.id);

    if (existingIndex > -1) {
      this.currentComanda.itens[existingIndex].qty += qty;
      this.currentComanda.itens[existingIndex].total = this.currentComanda.itens[existingIndex].qty * this.currentComanda.itens[existingIndex].price;
    } else {
      this.currentComanda.itens.push({
        id: product.id,
        code: product.codigo || product.code || '',
        name: product.nome || product.name || '',
        price: precoVenda,
        qty: qty,
        total: precoVenda * qty
      });
    }

    this.recalcularTotal();
    await this.salvarComandaAtual();
    this.renderComandaItens();
    showToast(`"${product.nome || product.name}" (${qty}x) adicionado à comanda!`, 'success');
  }

  async alterarQuantidade(index, newQty) {
    if (!this.currentComanda || !this.currentComanda.itens[index]) return;
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty <= 0) {
      return this.removerItem(index);
    }
    this.currentComanda.itens[index].qty = qty;
    const price = typeof this.currentComanda.itens[index].price === 'number' ? this.currentComanda.itens[index].price : parseFloat(this.currentComanda.itens[index].price || 0);
    this.currentComanda.itens[index].total = qty * price;
    this.recalcularTotal();
    await this.salvarComandaAtual();
    this.renderComandaItens();
  }

  async alterarPrecoUnitario(index, newPrice) {
    if (!this.currentComanda || !this.currentComanda.itens[index]) return;
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
      showToast('Preço unitário inválido.', 'error');
      this.renderComandaItens();
      return;
    }
    this.currentComanda.itens[index].price = price;
    this.currentComanda.itens[index].total = this.currentComanda.itens[index].qty * price;
    this.recalcularTotal();
    await this.salvarComandaAtual();
    this.renderComandaItens();
  }

  async removerItem(index) {
    if (!this.currentComanda) return;
    this.currentComanda.itens.splice(index, 1);
    this.recalcularTotal();
    await this.salvarComandaAtual();
    this.renderComandaItens();
  }

  recalcularTotal() {
    if (!this.currentComanda) return;
    this.currentComanda.total = this.currentComanda.itens.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
  }

  async salvarComandaAtual() {
    if (!this.currentComanda) return;
    try {
      await dbManager.salvarComanda(this.currentComanda);
      await this.loadComandas();
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar comanda.', 'error');
    }
  }

  renderComandaItens() {
    const tbody = document.getElementById('comanda-items-body');
    const totalEl = document.getElementById('comanda-modal-total');
    if (!tbody || !this.currentComanda) return;

    if (this.currentComanda.itens.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Nenhum item lançado.</td></tr>`;
      totalEl.textContent = 'R$ 0,00';
      return;
    }

    tbody.innerHTML = this.currentComanda.itens.map((item, idx) => {
      const priceVal = typeof item.price === 'number' ? item.price : parseFloat(item.price || 0);
      const totalVal = typeof item.total === 'number' ? item.total : (priceVal * (item.qty || 1));

      return `
        <tr class="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
          <td class="p-2 text-sm text-slate-200">${item.name}</td>
          <td class="p-2 text-sm text-center">
            <div class="flex items-center justify-center space-x-1">
              <button onclick="comandasModule.alterarQuantidade(${idx}, ${item.qty - 1})" class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer transition-colors" title="Diminuir">-</button>
              <input type="number" value="${item.qty}" min="1" onchange="comandasModule.alterarQuantidade(${idx}, this.value)" class="w-12 text-center bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100 font-mono font-semibold focus:outline-none focus:border-indigo-500">
              <button onclick="comandasModule.alterarQuantidade(${idx}, ${item.qty + 1})" class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer transition-colors" title="Aumentar">+</button>
            </div>
          </td>
          <td class="p-2 text-sm text-center">
            <div class="flex items-center justify-center">
              <span class="text-slate-400 text-xs mr-1">R$</span>
              <input type="number" step="0.01" min="0" value="${priceVal.toFixed(2)}" onchange="comandasModule.alterarPrecoUnitario(${idx}, this.value)" class="w-20 text-center bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-100 font-mono font-semibold focus:outline-none focus:border-indigo-500">
            </div>
          </td>
          <td class="p-2 text-sm text-right text-emerald-400 font-semibold">R$ ${totalVal.toFixed(2)}</td>
          <td class="p-2 text-right">
            <button onclick="comandasModule.removerItem(${idx})" class="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10 transition-colors" title="Remover item"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      `;
    }).join('');

    totalEl.textContent = `R$ ${this.currentComanda.total.toFixed(2)}`;
  }

  async enviarParaPDV() {
    if (!this.currentComanda || this.currentComanda.itens.length === 0) {
      showToast('Comanda vazia, não há o que enviar para o PDV.', 'warning');
      return;
    }

    if (window.pdvModule) {
      // Transfer items to PDV cart preserving negotiated unit price
      this.currentComanda.itens.forEach(item => {
        const prod = this.catalog.find(p => p.id === item.id);
        const maxStock = prod ? parseInt(prod.quantidade || prod.estoque || 0, 10) : 9999;
        const itemPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price || 0);

        const existingIndex = window.pdvModule.cart.findIndex(i => i.id === item.id);
        if (existingIndex > -1) {
          window.pdvModule.cart[existingIndex].qty += item.qty;
          window.pdvModule.cart[existingIndex].price = itemPrice; // Preserva preço unitário negociado
          window.pdvModule.cart[existingIndex].total = window.pdvModule.cart[existingIndex].qty * itemPrice;
        } else {
          window.pdvModule.cart.push({
            id: item.id,
            code: item.code || '',
            name: item.name || '',
            price: itemPrice, // Preserva preço unitário negociado
            qty: item.qty,
            total: item.qty * itemPrice,
            maxStock: maxStock
          });
        }
      });
      window.pdvModule.renderCart();
      
      // Marcar comanda como fechada e deletar
      try {
        await dbManager.excluirComanda(this.currentComanda.id);
        this.fecharModalComanda();
        await this.loadComandas();
        showToast('Itens enviados ao PDV. Finalize a venda no caixa!', 'success');
        
        // Mudar para aba do PDV
        if (window.appModule) {
          window.appModule.switchTab('pdv');
        }
      } catch (err) {
        console.error(err);
        showToast('Erro ao transferir comanda.', 'error');
      }
    }
  }

  // --- MESCLAR COMANDAS (UNIFICAÇÃO DE CONTAS) ---
  abrirModalMesclarComanda() {
    if (!this.comandas || this.comandas.length < 2) {
      showToast('É necessário ter pelo menos 2 comandas abertas para realizar a mesclagem.', 'warning');
      return;
    }

    const selectSource = document.getElementById('merge-source-comanda');
    const selectTarget = document.getElementById('merge-target-comanda');

    if (!selectSource || !selectTarget) return;

    const optionsHtml = '<option value="">Selecione a comanda...</option>' + this.comandas.map(c => `
      <option value="${c.id}">${c.nome} (R$ ${c.total.toFixed(2)} - ${c.itens.length} itens)</option>
    `).join('');

    selectSource.innerHTML = optionsHtml;
    selectTarget.innerHTML = optionsHtml;

    const modal = document.getElementById('modal-mesclar-comanda');
    if (modal) modal.classList.remove('hidden');
  }

  fecharModalMesclarComanda() {
    const modal = document.getElementById('modal-mesclar-comanda');
    if (modal) modal.classList.add('hidden');
  }

  async confirmarMesclarComandas() {
    const sourceEl = document.getElementById('merge-source-comanda');
    const targetEl = document.getElementById('merge-target-comanda');
    const sourceId = sourceEl ? Number(sourceEl.value) : 0;
    const targetId = targetEl ? Number(targetEl.value) : 0;

    if (!sourceId || !targetId) {
      showToast('Selecione as comandas de origem e destino.', 'warning');
      return;
    }

    if (sourceId === targetId) {
      showToast('A comanda de origem deve ser diferente da comanda de destino.', 'error');
      return;
    }

    const sourceComanda = this.comandas.find(c => Number(c.id) === sourceId);
    const targetComanda = this.comandas.find(c => Number(c.id) === targetId);

    if (!sourceComanda || !targetComanda) {
      showToast('Comandas selecionadas não foram encontradas.', 'error');
      return;
    }

    // Transferir e somar itens preservando preço unitário
    if (Array.isArray(sourceComanda.itens)) {
      sourceComanda.itens.forEach(srcItem => {
        const srcPrice = typeof srcItem.price === 'number' ? srcItem.price : parseFloat(srcItem.price || 0);
        const srcQty = parseInt(srcItem.qty || 1, 10);

        const existingIndex = targetComanda.itens.findIndex(tItem => {
          const tPrice = typeof tItem.price === 'number' ? tItem.price : parseFloat(tItem.price || 0);
          return tItem.id === srcItem.id && Math.abs(tPrice - srcPrice) < 0.001;
        });

        if (existingIndex > -1) {
          targetComanda.itens[existingIndex].qty += srcQty;
          targetComanda.itens[existingIndex].total = targetComanda.itens[existingIndex].qty * targetComanda.itens[existingIndex].price;
        } else {
          targetComanda.itens.push({
            id: srcItem.id,
            code: srcItem.code || '',
            name: srcItem.name || '',
            price: srcPrice,
            qty: srcQty,
            total: srcPrice * srcQty
          });
        }
      });
    }

    // Adicionar nota/histórico na comanda de destino
    const noteStr = `(Itens mesclados da Comanda ${sourceComanda.nome ? '"' + sourceComanda.nome + '"' : '#' + sourceComanda.id})`;
    targetComanda.observacao = targetComanda.observacao
      ? `${targetComanda.observacao} | ${noteStr}`
      : noteStr;

    // Recalcular total da comanda de destino
    targetComanda.total = targetComanda.itens.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
    targetComanda.updatedAt = new Date().toISOString();

    // Marcar comanda de origem com status MESCLADA
    sourceComanda.status = 'MESCLADA';
    sourceComanda.dataMesclagem = new Date().toISOString();

    try {
      await dbManager.salvarComanda(sourceComanda);
      await dbManager.salvarComanda(targetComanda);

      this.fecharModalMesclarComanda();
      await this.loadComandas();
      showToast(`Comanda "${sourceComanda.nome}" mesclada com sucesso na comanda "${targetComanda.nome}"!`, 'success');
    } catch (err) {
      console.error('Erro ao mesclar comandas:', err);
      showToast('Erro ao mesclar comandas.', 'error');
    }
  }
}

const comandasModule = new ComandasModule();
window.comandasModule = comandasModule;
