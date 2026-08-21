/**
 * Módulo 4: Portabilidade e Segurança (Backups e Exportação)
 * Sistema: VendEst PDV & Controle de Estoque
 * Importação/Exportação em JSON completo e Exportação de Estoque em CSV com UTF-8 BOM.
 */

class BackupModule {
  constructor() {
    this.bindEvents();
  }

  bindEvents() {
    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => this.exportJsonBackup());
    }

    const btnImportJson = document.getElementById('btn-import-json');
    const inputImportFile = document.getElementById('input-import-json-file');

    if (btnImportJson && inputImportFile) {
      btnImportJson.addEventListener('click', () => inputImportFile.click());
      inputImportFile.addEventListener('change', (e) => this.handleJsonImport(e));
    }

    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => this.exportStockCsv());
    }
  }

  async exportJsonBackup(forceDirectDownload = false) {
    try {
      const data = await dbManager.exportarDados();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `vendest_backup_${dateStr}.json`;

      // Tenta usar a File System Access API (pergunta onde salvar)
      if (!forceDirectDownload && window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'VendEst Backup JSON',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          showToast(`Backup salvo com sucesso!`, 'success');
          return;
        } catch (err) {
          if (err.name === 'AbortError') return; // Usuário cancelou
          console.warn('Erro no showSaveFilePicker, tentando método alternativo:', err);
        }
      }

      // Fallback: Método tradicional via <a> tag
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`Backup completo exportado: ${filename}`, 'success');
    } catch (err) {
      console.error('Erro ao exportar backup:', err);
      showToast('Erro ao exportar arquivo de backup.', 'error');
    }
  }

  async handleJsonImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const parsed = JSON.parse(content);

        const produtos = parsed.produtos || parsed.products;
        if (!produtos || !Array.isArray(produtos)) {
          showToast('Arquivo de backup inválido ou corrompido.', 'error');
          return;
        }

        const replaceAll = confirm(
          `Deseja SUBSTITUIR totalmente os dados atuais pelos dados do backup?\n\n` +
          `• Produtos no backup: ${produtos.length}\n` +
          `• Vendas no backup: ${(parsed.vendas || parsed.sales || []).length}\n\n` +
          `Clique em OK para Substituir Tudo ou Cancelar para Mesclar.`
        );

        await dbManager.importarDados(parsed, replaceAll);

        showToast('Dados de backup restaurados com sucesso!', 'success');

        if (window.stockModule) await window.stockModule.loadProducts();
        if (window.pdvModule) await window.pdvModule.loadProductCatalog();
        if (window.reportsModule) await window.reportsModule.carregarRelatorioVendasUI();

      } catch (err) {
        console.error('Erro ao importar backup:', err);
        showToast('Erro ao ler ou restaurar arquivo de backup.', 'error');
      } finally {
        event.target.value = '';
      }
    };

    reader.readAsText(file);
  }

  async exportStockCsv() {
    try {
      const produtos = await dbManager.listarProdutos();

      if (produtos.length === 0) {
        showToast('Não há produtos no estoque para exportar.', 'warning');
        return;
      }

      let csvContent = 'Código (SKU/EAN);Nome do Produto;Categoria;Preço de Custo (R$);Preço de Venda (R$);Quantidade em Estoque;Valor Total Estoque (R$)\n';

      produtos.forEach(p => {
        const codigo = p.codigo || p.code || '';
        const nome = p.nome || p.name || '';
        const cat = p.categoria || p.category || 'Geral';
        const precoCusto = parseFloat(p.precoCusto || p.costPrice || 0);
        const precoVenda = parseFloat(p.precoVenda || p.sellPrice || 0);
        const estoque = parseInt(p.estoque || p.stockQty || 0, 10);

        const costStr = precoCusto.toFixed(2).replace('.', ',');
        const sellStr = precoVenda.toFixed(2).replace('.', ',');
        const totalStr = (precoVenda * estoque).toFixed(2).replace('.', ',');
        const nameClean = `"${nome.replace(/"/g, '""')}"`;
        const catClean = `"${cat.replace(/"/g, '""')}"`;

        csvContent += `"${codigo}";${nameClean};${catClean};${costStr};${sellStr};${estoque};${totalStr}\n`;
      });

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `estoque_${dateStr}.csv`;

      // Tenta usar a File System Access API (pergunta onde salvar)
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Planilha CSV',
              accept: { 'text/csv': ['.csv'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          showToast(`Estoque exportado para CSV com sucesso!`, 'success');
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('Erro no showSaveFilePicker, tentando método alternativo:', err);
        }
      }

      // Fallback tradicional
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`Estoque exportado para Excel em CSV: ${filename}`, 'success');
    } catch (err) {
      console.error('Erro ao exportar CSV:', err);
      showToast('Erro ao exportar lista de estoque em CSV.', 'error');
    }
  }
}

const backupModule = new BackupModule();
