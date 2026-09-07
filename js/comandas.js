/**
 * Módulo de Comandas (Consumo Aberto)
 * Sistema: VendEst PDV & Controle de Estoque
 */

class ComandasModule {
  constructor() {
    this.comandas = [];
    this.currentComanda = null;
    this.catalog = [];
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

    grid.innerHTML = this.comandas.map(c => `
      <div class="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-lg flex flex-col justify-between cursor-pointer hover:bg-slate-700 transition-colors" onclick="comandasModule.abrirComanda(${c.id})">
        <div>
          <h3 class="font-bold text-lg text-slate-100">${c.nome}</h3>
          <p class="text-xs text-slate-400">Criada: ${new Date(c.dataCriacao).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
          <p class="text-xs text-slate-400 mt-2">${c.itens.length} itens lançados</p>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-700 flex justify-between items-center">
          <span class="text-emerald-400 font-bold text-xl">R$ ${c.total.toFixed(2)}</span>
          <i class="fa-solid fa-arrow-right text-indigo-400"></i>
        </div>
      </div>
    `).join('');
  }

  abrirComanda(id) {
    this.currentComanda = this.comandas.find(c => c.id === id);
    if (!this.currentComanda) return;

    const modal = document.getElementById('modal-comanda-detail');
    if (modal) {
      document.getElementById('comanda-detail-title').textContent = `Comanda: ${this.currentComanda.nome}`;
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
}

const comandasModule = new ComandasModule();
window.comandasModule = comandasModule;
