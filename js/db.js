/**
 * Módulo de Banco de Dados Local (IndexedDB Native)
 * Nome do Banco: PDV_Estoque_DB
 * Stores: 'produtos' e 'vendas' (Sem dados fake, persistência local atômica 100% limpa)
 */

class DBManager {
  constructor() {
    this.dbName = 'PDV_Estoque_DB';
    this.db = null;
  }

  /**
   * 1. Inicializa o banco de dados IndexedDB sem inserir nenhum dado falso
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName);

      request.onerror = (event) => {
        console.error('❌ Erro ao abrir IndexedDB:', event.target.error);
        reject('Não foi possível inicializar o banco de dados local.');
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('✅ IndexedDB "PDV_Estoque_DB" aberto. Versão:', this.db.version, '| Stores:', Array.from(this.db.objectStoreNames));
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('produtos')) {
          const productStore = db.createObjectStore('produtos', { keyPath: 'id', autoIncrement: true });
          productStore.createIndex('codigo', 'codigo', { unique: true });
        }
        if (!db.objectStoreNames.contains('vendas')) {
          const salesStore = db.createObjectStore('vendas', { keyPath: 'id', autoIncrement: true });
          salesStore.createIndex('data', 'data', { unique: false });
        }
      };
    });
  }

  /* ==========================================================================
     MÉTODOS CRUD DE PRODUTOS (ESTOQUE)
     ========================================================================== */

  /**
   * salvarProduto(produto): Adiciona ou atualiza no store 'produtos'
   */
  async salvarProduto(produto) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Banco de dados não está acessível.'));
      }
      
      const tx = this.db.transaction('produtos', 'readwrite');
      const store = tx.objectStore('produtos');

      const qty = parseInt(produto.quantidade || produto.estoque || produto.stockQty, 10);
      
      const dataToSave = {
        codigo: String(produto.codigo || produto.code || '').trim(),
        nome: String(produto.nome || produto.name || '').trim(),
        categoria: String(produto.categoria || produto.category || 'Geral').trim(),
        precoCusto: parseFloat(produto.precoCusto || produto.costPrice) || 0,
        precoVenda: parseFloat(produto.precoVenda || produto.sellPrice) || 0,
        quantidade: isNaN(qty) ? 0 : qty,
        estoque: isNaN(qty) ? 0 : qty,
        updatedAt: new Date().toISOString()
      };

      if (produto.id) {
        dataToSave.id = Number(produto.id);
      }

      const request = store.put(dataToSave);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * listarProdutos(): Retorna getAll() do store 'produtos' e chama renderizarTabelaEstoque
   */
  async listarProdutos() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        console.warn('⚠️ listarProdutos: banco não inicializado.');
        resolve([]);
        return;
      }
      const tx = this.db.transaction('produtos', 'readonly');
      const store = tx.objectStore('produtos');
      const request = store.getAll();

      request.onsuccess = () => {
        const produtos = request.result || [];
        produtos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        resolve(produtos);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Exclui um produto do store 'produtos' pelo ID
   */
  async excluirProduto(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('produtos', 'readwrite');
      const store = tx.objectStore('produtos');
      const request = store.delete(Number(id));

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Busca produto por código no store 'produtos'
   */
  async buscarProdutoPorCodigo(codigo) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('produtos', 'readonly');
      const store = tx.objectStore('produtos');
      const index = store.index('codigo');
      const request = index.get(String(codigo).trim());

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /* ==========================================================================
     MÉTODOS DE VENDA E BAIXA DE ESTOQUE
     ========================================================================== */

  /**
   * finalizarVenda(dadosVenda):
   * 1. Transação readwrite englobando 'produtos' e 'vendas'.
   * 2. Grava a venda no store 'vendas'.
   * 3. Para cada item da venda, subtrai a quantidade do store 'produtos'.
   */
  async finalizarVenda(dadosVenda) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Banco de dados não está acessível.'));
      }

      const tx = this.db.transaction(['produtos', 'vendas'], 'readwrite');
      const productStore = tx.objectStore('produtos');
      const salesStore = tx.objectStore('vendas');

      let completedSale = null;

      tx.onerror = (event) => {
        console.error('❌ Erro na transação de venda:', event.target.error);
        reject(event.target.error);
      };

      tx.oncomplete = () => {
        console.log('✅ Venda concluída com sucesso:', completedSale);
        
        // Recarregar/renderizar a tabela de Gestão de Estoque na tela após a venda
        if (window.stockModule && typeof window.stockModule.loadProducts === 'function') {
          window.stockModule.loadProducts();
        } else if (window.dbManager && typeof window.dbManager.listarProdutos === 'function') {
          window.dbManager.listarProdutos();
        }

        resolve(completedSale);
      };

      const now = new Date();
      const record = {
        code: `VD-${Date.now().toString().slice(-6)}`,
        data: now.toISOString(),
        timestamp: Date.now(),
        itens: dadosVenda.itens,
        subtotal: parseFloat(dadosVenda.subtotal || dadosVenda.total),
        desconto: parseFloat(dadosVenda.desconto || 0),
        total: Number(dadosVenda.total),
        formaPagamento: String(dadosVenda.formaPagamento),
        valorRecebido: parseFloat(dadosVenda.valorRecebido || dadosVenda.total),
        troco: parseFloat(dadosVenda.troco || 0)
      };

      const addSaleReq = salesStore.add(record);
      addSaleReq.onsuccess = (e) => {
        record.id = e.target.result;
        completedSale = record;
      };

      dadosVenda.itens.forEach(item => {
        const getReq = productStore.get(Number(item.id));
        getReq.onsuccess = () => {
          const produto = getReq.result;
          if (!produto) {
            tx.abort();
            return reject(new Error(`Produto ID ${item.id} não encontrado no estoque do banco de dados.`));
          }
          
          // Subtrai a quantidade vendida
          const qtdAtual = Number(produto.quantidade || produto.estoque || 0);
          const qtdVendida = Number(item.quantidade || item.qty || 0);
          
          produto.quantidade = qtdAtual - qtdVendida;
          produto.estoque = produto.quantidade; // Mantém compatibilidade com a key estoque
          produto.updatedAt = new Date().toISOString();
          
          productStore.put(produto);
        };
        
        getReq.onerror = () => {
          tx.abort();
          return reject(new Error(`Falha ao acessar banco de dados para buscar o produto ID ${item.id}.`));
        };
      });
    });
  }

  /* ==========================================================================
     MÉTODOS DE RELATÓRIO DE VENDAS
     ========================================================================== */

  /**
   * carregarRelatorioVendas(filtroData = null):
   * Busca vendas com store.getAll() e filtra com venda.data.startsWith(filtroData) se filtroData for fornecido
   */
  async carregarRelatorioVendas(filtroData = null) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      const tx = this.db.transaction('vendas', 'readonly');
      const store = tx.objectStore('vendas');
      const request = store.getAll();

      request.onsuccess = () => {
        let vendas = request.result || [];
        vendas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (filtroData && String(filtroData).trim() !== '') {
          const cleanFilter = String(filtroData).trim();
          vendas = vendas.filter(venda => venda.data && venda.data.startsWith(cleanFilter));
        }

        resolve(vendas);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /* ==========================================================================
     MÉTODOS DE BACKUP
     ========================================================================== */

  async exportarDados() {
    const produtos = await this.listarProdutos();
    const vendas = await this.carregarRelatorioVendas();
    return {
      version: 1,
      dbName: 'PDV_Estoque_DB',
      exportedAt: new Date().toISOString(),
      produtos,
      vendas
    };
  }

  async importarDados(data, replaceAll = true) {
    if (!data || !Array.isArray(data.produtos)) {
      throw new Error('Arquivo de backup inválido.');
    }

    const tx = this.db.transaction(['produtos', 'vendas'], 'readwrite');
    const productStore = tx.objectStore('produtos');
    const salesStore = tx.objectStore('vendas');

    if (replaceAll) {
      productStore.clear();
      salesStore.clear();
    }

    for (const p of data.produtos) {
      delete p.id;
      productStore.add(p);
    }

    if (Array.isArray(data.vendas)) {
      for (const v of data.vendas) {
        delete v.id;
        salesStore.add(v);
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

// Instância global do banco de dados
const dbManager = new DBManager();
window.dbManager = dbManager;
