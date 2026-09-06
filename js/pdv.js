/**
 * Módulo 2: Frente de Caixa (PDV)
 * Sistema: VendEst PDV & Controle de Estoque
 * Bípagem com leitor USB barcode, carrinho dinâmico, troco automático e baixa de estoque no store 'vendas' e 'produtos'.
 */

class PDVModule {
  constructor() {
    this.cart = [];
    this.catalog = [];
    this.selectedPaymentMethod = 'DINHEIRO';
    this.payments = [];
    this.discount = 0;
    this.lastCompletedSale = null;
  }

  async init() {
    this.checkRegisterStatus();
    this.bindEvents();
    await this.loadProductCatalog();
    this.focusScanInput();
  }

  // --- CONTROLE DE CAIXA ---
  checkRegisterStatus() {
    const isAberto = localStorage.getItem('vendest_caixa_aberto') === 'true';
    const overlay = document.getElementById('caixa-closed-overlay');
    if (overlay) {
      if (isAberto) {
        overlay.classList.add('hidden');
      } else {
        overlay.classList.remove('hidden');
      }
    }
    return isAberto;
  }

  openCashRegisterModal() {
    const modal = document.getElementById('modal-cash-open');
    if (modal) {
      modal.classList.remove('hidden');
      setTimeout(() => document.getElementById('cash-open-amount').focus(), 100);
    }
  }

  closeCashRegisterModal() {
    const modalOpen = document.getElementById('modal-cash-open');
    if (modalOpen) modalOpen.classList.add('hidden');

    const modalClose = document.getElementById('modal-cash-close');
    if (modalClose) modalClose.classList.add('hidden');
  }

  openRegister() {
    const amount = parseFloat(document.getElementById('cash-open-amount').value) || 0;
    localStorage.setItem('vendest_caixa_aberto', 'true');
    localStorage.setItem('vendest_caixa_fundo', amount.toString());
    localStorage.setItem('vendest_caixa_abertura_ts', Date.now().toString());
    this.closeCashRegisterModal();
    this.checkRegisterStatus();
    showToast('Caixa aberto com sucesso! Turno iniciado.', 'success');
  }

  async closeRegisterModal() {
    if (!this.checkRegisterStatus()) {
      showToast('O caixa já está fechado.', 'warning');
      return;
    }
    
    // Obter dados do turno
    const fundo = parseFloat(localStorage.getItem('vendest_caixa_fundo')) || 0;
    const aberturaTs = parseInt(localStorage.getItem('vendest_caixa_abertura_ts'), 10) || 0;
    
    // Recuperar vendas a partir do momento de abertura
    let vendas = [];
    let sangrias = [];
    try {
      const dbVendas = await dbManager.carregarRelatorioVendas();
      vendas = dbVendas.filter(v => new Date(v.data).getTime() >= aberturaTs);
      sangrias = await dbManager.listarSangriasPorTurno(aberturaTs);
    } catch (err) {
      console.error(err);
    }

    let vendasDinheiro = 0;
    let vendasPix = 0;
    let vendasCartoes = 0;
    let totalSangrias = 0;

    vendas.forEach(v => {
      if (Array.isArray(v.pagamentos) && v.pagamentos.length > 0) {
        v.pagamentos.forEach(p => {
          const val = parseFloat(p.valor) || 0;
          const formaUpper = String(p.forma || '').toUpperCase();
          if (formaUpper.includes('DINHEIRO')) vendasDinheiro += val;
          else if (formaUpper.includes('PIX')) vendasPix += val;
          else vendasCartoes += val;
        });
      } else {
        const val = parseFloat(v.total) || 0;
        const formaUpper = String(v.formaPagamento || '').toUpperCase();
        if (formaUpper.includes('DINHEIRO')) vendasDinheiro += val;
        else if (formaUpper.includes('PIX')) vendasPix += val;
        else vendasCartoes += val;
      }
    });

    sangrias.forEach(s => {
      totalSangrias += parseFloat(s.valor) || 0;
    });

    const totalCaixaFinal = fundo + vendasDinheiro + vendasPix + vendasCartoes - totalSangrias;

    document.getElementById('cash-close-initial').textContent = fundo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('cash-close-money').textContent = vendasDinheiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('cash-close-pix').textContent = vendasPix.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('cash-close-cards').textContent = vendasCartoes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const sangriasEl = document.getElementById('cash-close-sangrias');
    if (sangriasEl) sangriasEl.textContent = `- ${totalSangrias.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;

    document.getElementById('cash-close-total').textContent = totalCaixaFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const modal = document.getElementById('modal-cash-close');
    if (modal) modal.classList.remove('hidden');
  }

  async closeRegister() {
    const doBackup = document.getElementById('cash-close-backup-cb')?.checked;
    
    localStorage.setItem('vendest_caixa_aberto', 'false');
    this.closeCashRegisterModal();
    this.checkRegisterStatus();
    showToast('Caixa fechado com sucesso!', 'success');

    if (doBackup && window.backupModule) {
      window.backupModule.exportJsonBackup();
    }
  }

  // --- CONTROLE DE SANGRIA ---
  abrirModalSangria() {
    if (!this.checkRegisterStatus()) {
      showToast('O caixa está fechado! Sangria não permitida.', 'error');
      return;
    }
    const modal = document.getElementById('modal-sangria');
    if (modal) {
      document.getElementById('sangria-amount').value = '';
      document.getElementById('sangria-reason').value = '';
      modal.classList.remove('hidden');
      setTimeout(() => document.getElementById('sangria-amount').focus(), 100);
    }
  }

  fecharModalSangria() {
    const modal = document.getElementById('modal-sangria');
    if (modal) modal.classList.add('hidden');
  }

  async confirmarSangria() {
    const amountInput = document.getElementById('sangria-amount');
    const reasonInput = document.getElementById('sangria-reason');

    const valor = parseFloat(amountInput.value);
    const motivo = reasonInput.value.trim();

    if (isNaN(valor) || valor <= 0) {
      showToast('Informe um valor válido para a sangria.', 'error');
      return;
    }

    if (!motivo) {
      showToast('Informe o motivo/descrição da sangria.', 'warning');
      return;
    }

    try {
      await dbManager.salvarSangria({
        valor,
        motivo,
        autorizadoPor: window.authModule ? window.authModule.currentUser : 'Admin'
      });
      showToast('Sangria registrada com sucesso.', 'success');
      this.fecharModalSangria();
    } catch (err) {
      console.error(err);
      showToast('Erro ao registrar sangria.', 'error');
    }
  }
  // -----------------------

  focusScanInput() {
    const input = document.getElementById('pdv-barcode-input');
    if (input) {
      input.focus();
      input.select();
    }
  }

  async loadProductCatalog() {
    try {
      this.catalog = await dbManager.listarProdutos();
    } catch (err) {
      console.error('Erro ao carregar catálogo para PDV:', err);
    }
  }

  bindEvents() {
    const scanInput = document.getElementById('pdv-barcode-input');
    if (scanInput) {
      scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleBarcodeScan(scanInput.value.trim());
        }
      });

      scanInput.addEventListener('input', (e) => {
        this.renderSearchResults(e.target.value.trim());
      });
    }

    const amountReceivedInput = document.getElementById('pdv-amount-received');
    if (amountReceivedInput) {
      ['input', 'keyup', 'change', 'blur'].forEach(evtName => {
        amountReceivedInput.addEventListener(evtName, () => this.calculateChange());
      });
    }

    const discountInput = document.getElementById('pdv-discount-input');
    if (discountInput) {
      discountInput.addEventListener('input', (e) => {
        this.discount = parseFloat(e.target.value) || 0;
        this.renderCart();
      });
    }
  }

  async handleBarcodeScan(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return;

    try {
      this.catalog = await dbManager.listarProdutos();

      const q = trimmed.toLowerCase();

      let product = this.catalog.find(p => String(p.codigo || p.code || '').trim().toLowerCase() === q);

      if (!product) {
        product = this.catalog.find(p => String(p.nome || p.name || '').trim().toLowerCase().includes(q));
      }

      if (product) {
        this.addProductToCart(product);
        const scanInput = document.getElementById('pdv-barcode-input');
        if (scanInput) scanInput.value = '';
        this.hideSearchResults();
      } else {
        showToast(`Produto não encontrado com o termo "${trimmed}".`, 'error');
      }
    } catch (err) {
      console.error('Erro na bípagem:', err);
    }
  }

  renderSearchResults(query) {
    const resultsContainer = document.getElementById('pdv-search-results');
    if (!resultsContainer) return;

    if (!query || query.length < 2) {
      resultsContainer.classList.add('hidden');
      return;
    }

    const q = query.toLowerCase();
    const filtered = this.catalog.filter(p =>
      String(p.nome || p.name || '').toLowerCase().includes(q) ||
      String(p.codigo || p.code || '').toLowerCase().includes(q)
    ).slice(0, 6);

    if (filtered.length === 0) {
      resultsContainer.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">Nenhum produto encontrado</div>`;
      resultsContainer.classList.remove('hidden');
      return;
    }

    resultsContainer.innerHTML = filtered.map(p => `
      <div onclick="pdvModule.selectSearchResult(${p.id})" class="flex items-center justify-between p-3 hover:bg-slate-700/90 cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors">
        <div>
          <p class="font-semibold text-sm text-slate-100">${p.nome || p.name || ''}</p>
          <p class="text-xs text-slate-400 font-mono">SKU: ${p.codigo || p.code || ''} | Estoque: ${p.quantidade || p.estoque || 0} un</p>
        </div>
        <span class="font-bold text-emerald-400 text-sm">R$ ${parseFloat(p.precoVenda || 0).toFixed(2)}</span>
      </div>
    `).join('');

    resultsContainer.classList.remove('hidden');
  }

  hideSearchResults() {
    const container = document.getElementById('pdv-search-results');
    if (container) container.classList.add('hidden');
  }

  selectSearchResult(productId) {
    const product = this.catalog.find(p => Number(p.id) === Number(productId));
    if (product) {
      this.addProductToCart(product);
      const scanInput = document.getElementById('pdv-barcode-input');
      if (scanInput) scanInput.value = '';
      this.hideSearchResults();
      this.focusScanInput();
    }
  }

  addProductToCart(product) {
    const estoqueAtual = parseInt(product.quantidade || product.estoque || product.stockQty || 0, 10);
    const precoVenda = parseFloat(product.precoVenda || product.sellPrice || 0);
    const codigo = product.codigo || product.code || '';
    const nome = product.nome || product.name || '';

    if (estoqueAtual <= 0) {
      showToast(`Atenção: O produto "${nome}" está com ESTOQUE ZERADO!`, 'error');
    }

    const existingIndex = this.cart.findIndex(item => item.id === product.id);

    if (existingIndex > -1) {
      if (this.cart[existingIndex].qty + 1 > estoqueAtual) {
        showToast(`Quantidade solicitada excede o estoque atual (${estoqueAtual} un).`, 'warning');
      }
      this.cart[existingIndex].qty += 1;
      this.cart[existingIndex].total = this.cart[existingIndex].qty * this.cart[existingIndex].price;
    } else {
      this.cart.push({
        id: product.id,
        code: codigo,
        name: nome,
        price: precoVenda,
        qty: 1,
        total: precoVenda,
        maxStock: estoqueAtual
      });
    }

    this.renderCart();
    showToast(`"${nome}" adicionado ao carrinho!`, 'success');
  }

  updateCartQty(index, delta) {
    if (!this.cart[index]) return;

    const newQty = this.cart[index].qty + delta;
    if (newQty <= 0) {
      this.removeCartItem(index);
      return;
    }

    if (newQty > this.cart[index].maxStock) {
      showToast(`Quantidade máxima em estoque atingida (${this.cart[index].maxStock} un).`, 'warning');
    }

    this.cart[index].qty = newQty;
    this.cart[index].total = newQty * this.cart[index].price;
    this.renderCart();
  }

  setCartQty(index, value) {
    const qty = parseInt(value, 10);
    if (isNaN(qty) || qty <= 0) {
      this.removeCartItem(index);
      return;
    }

    this.cart[index].qty = qty;
    this.cart[index].total = qty * this.cart[index].price;
    this.renderCart();
  }

  setCartItemPrice(index, value) {
    const newPrice = parseFloat(value);
    if (isNaN(newPrice) || newPrice < 0) {
      showToast('Preço unitário inválido.', 'error');
      this.renderCart();
      return;
    }
    this.cart[index].price = newPrice;
    this.cart[index].total = this.cart[index].qty * newPrice;
    this.renderCart();
  }

  removeCartItem(index) {
    this.cart.splice(index, 1);
    this.renderCart();
  }

  clearCart() {
    if (this.cart.length === 0) return;
    this.cart = [];
    this.discount = 0;
    const discountInput = document.getElementById('pdv-discount-input');
    if (discountInput) discountInput.value = 0;
    this.renderCart();
    showToast('Venda cancelada / carrinho limpo.', 'info');
    this.focusScanInput();
  }

  renderCart() {
    const tbody = document.getElementById('pdv-cart-body');
    const itemCountEl = document.getElementById('pdv-cart-item-count');
    const subtotalEl = document.getElementById('pdv-subtotal-price');
    const totalEl = document.getElementById('pdv-total-price');
    const totalHeaderEl = document.getElementById('pdv-header-total');

    if (!tbody) return;

    if (this.cart.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-12 text-center text-slate-400">
            <i class="fa-solid fa-cart-shopping text-4xl text-slate-600 mb-2 block"></i>
            <p class="font-medium text-slate-300">Carrinho Vazio</p>
            <p class="text-xs text-slate-500 mt-1">Bipe um código de barras ou pesquise acima para começar.</p>
          </td>
        </tr>
      `;
      if (itemCountEl) itemCountEl.textContent = '0 itens';
      if (subtotalEl) subtotalEl.textContent = 'R$ 0,00';
      if (totalEl) totalEl.textContent = 'R$ 0,00';
      if (totalHeaderEl) totalHeaderEl.textContent = 'R$ 0,00';
      return;
    }

    const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
    const finalTotal = Math.max(0, subtotal - this.discount);
    const totalQuantity = this.cart.reduce((sum, item) => sum + item.qty, 0);

    if (itemCountEl) itemCountEl.textContent = `${totalQuantity} item(ns)`;
    if (subtotalEl) subtotalEl.textContent = subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (totalEl) totalEl.textContent = finalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (totalHeaderEl) totalHeaderEl.textContent = finalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    tbody.innerHTML = this.cart.map((item, idx) => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition-colors text-sm">
        <td class="px-4 py-3">
          <p class="font-semibold text-slate-100">${item.name}</p>
          <p class="text-xs font-mono text-slate-400">SKU: ${item.code}</p>
        </td>
        <td class="px-4 py-3 text-slate-300">
          <div class="flex items-center space-x-1">
            <span class="text-xs">R$</span>
            <input type="number" step="0.01" min="0" value="${item.price.toFixed(2)}" onchange="pdvModule.setCartItemPrice(${idx}, this.value)" class="w-20 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm focus:outline-none focus:border-indigo-500 py-1 px-2">
          </div>
        </td>
        <td class="px-4 py-3">
          <div class="flex items-center space-x-1">
            <button onclick="pdvModule.updateCartQty(${idx}, -1)" class="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold transition-colors">-</button>
            <input type="number" min="1" value="${item.qty}" onchange="pdvModule.setCartQty(${idx}, this.value)" class="w-12 text-center bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 py-1">
            <button onclick="pdvModule.updateCartQty(${idx}, 1)" class="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold transition-colors">+</button>
          </div>
        </td>
        <td class="px-4 py-3 font-semibold text-emerald-400">R$ ${item.total.toFixed(2)}</td>
        <td class="px-4 py-3 text-right">
          <button onclick="pdvModule.removeCartItem(${idx})" class="text-rose-400 hover:text-rose-300 p-1.5 rounded hover:bg-rose-500/10 transition-colors" title="Remover item">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // --- GERENCIAMENTO DE MÚLTIPLOS PAGAMENTOS E FECHAMENTO ---
  getPaymentLabel(method) {
    const labels = {
      'DINHEIRO': 'Dinheiro',
      'PIX': 'PIX',
      'CREDITO': 'Cartão Crédito',
      'DEBITO': 'Cartão Débito'
    };
    return labels[method] || method;
  }

  selectPaymentMethod(method) {
    this.selectedPaymentMethod = method;
    const paymentButtons = document.querySelectorAll('.pdv-payment-btn');
    paymentButtons.forEach(btn => {
      if (btn.dataset.method === method) {
        btn.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-600/30', 'border-indigo-500');
        btn.classList.remove('bg-slate-900');
      } else {
        btn.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-600/30', 'border-indigo-500');
        btn.classList.add('bg-slate-900');
      }
    });

    const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
    const totalVenda = Math.max(0, subtotal - this.discount);
    const totalPago = this.payments.reduce((acc, p) => acc + p.valor, 0);
    const restante = Math.max(0, totalVenda - totalPago);

    const input = document.getElementById('pdv-amount-received');
    if (input) {
      input.value = restante > 0 ? restante.toFixed(2) : '';
      input.focus();
      input.select();
    }
  }

  addPaymentFromInput() {
    const input = document.getElementById('pdv-amount-received');
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val <= 0) {
      showToast('Digite um valor válido para o pagamento.', 'warning');
      return;
    }
    this.addPayment(this.selectedPaymentMethod, val);
  }

  addPayment(method, valor) {
    const val = parseFloat(valor);
    if (isNaN(val) || val <= 0) return;

    this.payments.push({
      forma: method,
      valor: val
    });

    this.updatePaymentTotals();
    showToast(`Pagamento em ${this.getPaymentLabel(method)} (R$ ${val.toFixed(2)}) adicionado.`, 'success');
  }

  removePayment(index) {
    if (index >= 0 && index < this.payments.length) {
      const removed = this.payments.splice(index, 1)[0];
      this.updatePaymentTotals();
      if (removed) {
        showToast(`Pagamento em ${this.getPaymentLabel(removed.forma)} removido.`, 'info');
      }
    }
  }

  renderPaymentsList() {
    const listEl = document.getElementById('pdv-payments-list');
    if (!listEl) return;

    if (this.payments.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-slate-500 italic py-1 text-center">Nenhum pagamento adicionado ainda.</p>`;
      return;
    }

    listEl.innerHTML = this.payments.map((p, idx) => `
      <div class="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
        <span class="font-semibold text-slate-200">${this.getPaymentLabel(p.forma)}</span>
        <div class="flex items-center gap-3">
          <span class="font-mono font-bold text-emerald-400">R$ ${p.valor.toFixed(2)}</span>
          <button type="button" onclick="pdvModule.removePayment(${idx})" class="text-rose-400 hover:text-rose-300 transition-colors p-1 cursor-pointer" title="Remover pagamento">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  updatePaymentTotals() {
    const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
    const totalVenda = Math.max(0, subtotal - this.discount);
    const totalPago = this.payments.reduce((acc, p) => acc + p.valor, 0);
    const saldoRestante = Math.max(0, totalVenda - totalPago);

    const totalModalEl = document.getElementById('pdv-modal-total');
    const addedTotalEl = document.getElementById('pdv-modal-added-total');
    const remainingEl = document.getElementById('pdv-modal-remaining');

    if (totalModalEl) totalModalEl.textContent = totalVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (addedTotalEl) addedTotalEl.textContent = totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (remainingEl) remainingEl.textContent = saldoRestante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const input = document.getElementById('pdv-amount-received');
    if (input) {
      input.value = saldoRestante > 0 ? saldoRestante.toFixed(2) : '';
    }

    const totalDinheiro = this.payments
      .filter(p => String(p.forma).toUpperCase().includes('DINHEIRO'))
      .reduce((acc, p) => acc + p.valor, 0);
    const totalOutros = this.payments
      .filter(p => !String(p.forma).toUpperCase().includes('DINHEIRO'))
      .reduce((acc, p) => acc + p.valor, 0);

    const troco = Math.max(0, (totalDinheiro + totalOutros) - totalVenda);

    const changeContainer = document.getElementById('pdv-change-container');
    const changeAmountEl = document.getElementById('pdv-change-amount');

    if (troco > 0) {
      if (changeContainer) changeContainer.classList.remove('hidden');
      if (changeAmountEl) changeAmountEl.textContent = troco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } else {
      if (changeContainer) changeContainer.classList.add('hidden');
    }

    const btnSubmit = document.getElementById('pdv-btn-submit-sale');
    if (btnSubmit) {
      btnSubmit.disabled = (totalPago < totalVenda - 0.001);
    }

    this.renderPaymentsList();
  }

  openPaymentModal() {
    if (!this.checkRegisterStatus()) {
      showToast('O caixa está fechado! Abra o caixa para finalizar vendas.', 'error');
      return;
    }

    if (this.cart.length === 0) {
      showToast('O carrinho está vazio! Adicione itens antes de finalizar a venda.', 'warning');
      return;
    }

    const modal = document.getElementById('modal-payment');
    const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
    const finalTotal = Math.max(0, subtotal - this.discount);

    this.payments = [];
    this.selectedPaymentMethod = 'DINHEIRO';

    const obsInput = document.getElementById('pdv-sale-obs');
    if (obsInput) obsInput.value = '';

    this.payments.push({
      forma: 'DINHEIRO',
      valor: finalTotal
    });

    this.selectPaymentMethod('DINHEIRO');
    this.updatePaymentTotals();

    if (modal) modal.classList.remove('hidden');
  }

  closePaymentModal() {
    const modal = document.getElementById('modal-payment');
    if (modal) modal.classList.add('hidden');
    this.focusScanInput();
  }

  async submitSale() {
    if (this.cart.length === 0) return;

    const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
    const finalTotal = Math.max(0, subtotal - this.discount);
    const totalPago = this.payments.reduce((acc, p) => acc + p.valor, 0);

    if (totalPago < finalTotal - 0.001) {
      showToast('O total pago é menor que o valor da venda!', 'error');
      return;
    }

    const troco = Math.max(0, totalPago - finalTotal);
    const obsVal = document.getElementById('pdv-sale-obs')?.value.trim() || '';

    const pagamentosFormatados = this.payments.map(p => ({
      forma: this.getPaymentLabel(p.forma),
      valor: p.valor
    }));

    const formaPagamentoStr = pagamentosFormatados.length === 1
      ? pagamentosFormatados[0].forma
      : 'Múltiplo (' + pagamentosFormatados.map(p => p.forma).join(', ') + ')';

    const dadosVenda = {
      itens: this.cart.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        price: item.price,
        qty: item.qty,
        total: item.total
      })),
      subtotal,
      desconto: this.discount,
      total: finalTotal,
      formaPagamento: formaPagamentoStr,
      pagamentos: pagamentosFormatados,
      observacao: obsVal,
      valorRecebido: totalPago,
      troco: troco
    };

    try {
      const completedSale = await dbManager.finalizarVenda(dadosVenda);
      this.lastCompletedSale = completedSale;

      showToast('Venda finalizada com sucesso! Baixa no estoque efetuada.', 'success');

      this.cart = [];
      this.discount = 0;
      this.payments = [];
      const discountInput = document.getElementById('pdv-discount-input');
      if (discountInput) discountInput.value = 0;
      this.renderCart();
      this.closePaymentModal();

      await dbManager.listarProdutos();
      if (window.reportsModule) {
        await window.reportsModule.carregarRelatorioVendasUI();
      }

      this.openReceiptModal(completedSale);
    } catch (err) {
      console.error('Erro ao finalizar venda:', err);
      showToast('Erro ao processar venda no banco de dados local.', 'error');
    }
  }

  openReceiptModal(sale) {
    const modal = document.getElementById('modal-receipt');
    const container = document.getElementById('receipt-content');

    if (!modal || !container || !sale) return;

    const dataHoraStr = sale.data ? new Date(sale.data).toLocaleString('pt-BR') : '';

    let configData = { nome: 'VendEst Comercio PDV', cnpj: '00.000.000/0001-00', telefone: '', endereco: '' };
    const savedConfig = localStorage.getItem('empresa_pdv');
    if (savedConfig) {
      try { configData = JSON.parse(savedConfig); } catch (e) {}
    }

    container.innerHTML = `
      <div class="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
        <h2 class="font-bold text-lg uppercase tracking-wider text-slate-900">${configData.nome || 'VendEst Comercio PDV'}</h2>
        <p class="text-xs text-slate-700">${configData.endereco || 'Sistema de Estoque & Frente de Caixa'}</p>
        <p class="text-xs text-slate-600 mt-1">CNPJ/CPF: ${configData.cnpj || '00.000.000/0001-00'}</p>
        ${configData.telefone ? `<p class="text-xs text-slate-600 mt-0.5">Tel/WhatsApp: ${configData.telefone}</p>` : ''}
        <p class="text-xs font-semibold text-slate-800 mt-1">CUPOM NÃO FISCAL</p>
      </div>

      <div class="text-xs text-slate-700 space-y-1 mb-3">
        <p><strong>Cód. Venda:</strong> ${sale.code || ''}</p>
        <p><strong>Data/Hora:</strong> ${dataHoraStr}</p>
        ${Array.isArray(sale.pagamentos) && sale.pagamentos.length > 0 ? `
          <div>
            <strong>Pagamento:</strong>
            <ul class="pl-2 space-y-0.5 mt-0.5">
              ${sale.pagamentos.map(p => `<li>• ${p.forma}: R$ ${Number(p.valor).toFixed(2)}</li>`).join('')}
            </ul>
          </div>
        ` : `
          <p><strong>Forma Pagto:</strong> ${sale.formaPagamento}</p>
        `}
        ${sale.observacao ? `
          <p class="pt-1 text-slate-900 font-semibold border-t border-dashed border-slate-400 mt-1"><strong>Obs:</strong> ${sale.observacao}</p>
        ` : ''}
      </div>

      <table class="w-full text-xs text-left mb-3">
        <thead>
          <tr class="border-b border-t border-dashed border-slate-400">
            <th class="py-1">Qtd x Item</th>
            <th class="py-1 text-right">Unit</th>
            <th class="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(sale.itens || []).map(item => `
            <tr>
              <td class="py-1">
                <span class="font-semibold">${item.qty}x</span> ${item.name}
              </td>
              <td class="py-1 text-right">R$ ${item.price.toFixed(2)}</td>
              <td class="py-1 text-right font-medium">R$ ${item.total.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="border-t border-dashed border-slate-400 pt-2 text-xs space-y-1 text-slate-800">
        <div class="flex justify-between">
          <span>Subtotal:</span>
          <span>R$ ${(sale.subtotal || sale.total).toFixed(2)}</span>
        </div>
        ${sale.desconto > 0 ? `
          <div class="flex justify-between text-rose-600">
            <span>Desconto:</span>
            <span>- R$ ${sale.desconto.toFixed(2)}</span>
          </div>
        ` : ''}
        <div class="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-300 pt-1">
          <span>TOTAL:</span>
          <span>R$ ${sale.total.toFixed(2)}</span>
        </div>
        <div class="flex justify-between pt-1">
          <span>Valor Pago:</span>
          <span>R$ ${(sale.valorRecebido || sale.total).toFixed(2)}</span>
        </div>
        <div class="flex justify-between font-semibold">
          <span>Troco:</span>
          <span>R$ ${(sale.troco || 0).toFixed(2)}</span>
        </div>
      </div>

      <div class="text-center border-t border-dashed border-slate-400 mt-4 pt-3 text-[11px] text-slate-600">
        <p>Obrigado pela preferência!</p>
        <p class="font-mono mt-1">VendEst - 100% Offline</p>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  closeReceiptModal() {
    const modal = document.getElementById('modal-receipt');
    if (modal) modal.classList.add('hidden');
    this.focusScanInput();
  }

  printReceipt() {
    window.print();
  }
}

const pdvModule = new PDVModule();
window.pdvModule = pdvModule;
