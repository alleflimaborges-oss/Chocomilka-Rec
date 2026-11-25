const API = "/api/funcionarios";
const $ = (id) => document.getElementById(id);

const corpo = $("listaItens");
const campoBusca = $("busca");
const dialogoCadastro = $("dialogoCadastro");
const formulario = $("formCadastro");
const botaoSalvar = $("botaoSalvar");
const erroGeral = $("erroGeral");
const dialogoExcluir = $("dialogoExcluir");
const COLUNAS = 4;

let funcionarios = [];
let idParaExcluir = null;

/* ---------- Utilitários ---------- */
function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[c]);
}
function normalizar(texto) {
    return String(texto ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function plural(n, singular, pluralTexto) {
    return `${n} ${n === 1 ? singular : pluralTexto}`;
}
function avisar(texto, tipo = "sucesso") {
    const aviso = document.createElement("div");
    aviso.className = `aviso ${tipo === "erro" ? "erro" : ""}`;
    aviso.textContent = texto;
    $("avisos").appendChild(aviso);
    setTimeout(() => aviso.remove(), tipo === "erro" ? 6000 : 3500);
}
async function chamarAPI(url, opcoes) {
    let resposta;
    try {
        resposta = await fetch(url, opcoes);
    } catch {
        throw new Error("Não foi possível conectar ao servidor. Confira se o Flask está rodando.");
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Algo deu errado. Tente de novo.");
    return dados;
}
function enviarJSON(metodo, corpoJSON) {
    return { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoJSON) };
}

/* ---------- Lista ---------- */
function linhaVazia(html) {
    return `<tr class="vazio-linha"><td colspan="${COLUNAS}" class="vazio">${html}</td></tr>`;
}

function atualizarResumo() {
    const n = funcionarios.length;
    const total = funcionarios.reduce((soma, f) => soma + f.movimentacoes, 0);
    if (n === 0) {
        $("tituloPagina").textContent = "Nenhum funcionário cadastrado";
        $("subtituloPagina").textContent = "Cadastre a equipe da loja pelo botão “Novo funcionário”.";
        return;
    }
    $("tituloPagina").textContent = plural(n, "funcionário cadastrado", "funcionários cadastrados");
    $("subtituloPagina").textContent = `${plural(total, "movimentação registrada", "movimentações registradas")} no total.`;
}

function atualizarCargos() {
    const cargos = [...new Set(funcionarios.map((f) => f.cargo))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    $("listaCargos").innerHTML = cargos.map((c) => `<option value="${escaparHTML(c)}">`).join("");
}

function renderizar() {
    atualizarResumo();
    atualizarCargos();
    const termo = normalizar(campoBusca.value.trim());
    const lista = funcionarios.filter((f) =>
        !termo || [f.nome, f.cargo].some((v) => normalizar(v).includes(termo)));
    $("contador").textContent = funcionarios.length ? `Mostrando ${lista.length} de ${funcionarios.length}.` : "";

    if (funcionarios.length === 0) {
        corpo.innerHTML = linhaVazia(`<strong>Nenhum funcionário ainda</strong>Cadastre o primeiro para começar.<br>
            <button type="button" class="primario" data-abrir-novo>+ Novo funcionário</button>`);
        return;
    }
    if (lista.length === 0) {
        corpo.innerHTML = linhaVazia(`<strong>Nenhum funcionário encontrado</strong>Tente outro termo.<br>
            <button type="button" class="secundario" data-limpar>Limpar busca</button>`);
        return;
    }

    corpo.innerHTML = lista.map((f) => {
        const nome = escaparHTML(f.nome);
        return `
        <tr data-id="${f.id_funcionario}">
            <td class="nome">${nome}</td>
            <td data-label="Cargo">${escaparHTML(f.cargo)}</td>
            <td data-label="Movimentações" class="numero">${f.movimentacoes}</td>
            <td class="acoes-celula">
                <div class="acoes-linha">
                    <button type="button" class="editar" data-acao="editar" aria-label="Editar ${nome}">Editar</button>
                    <button type="button" class="excluir" data-acao="excluir" aria-label="Excluir ${nome}">Excluir</button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

async function carregar() {
    corpo.innerHTML = Array.from({ length: 3 }, () =>
        `<tr class="esqueleto" aria-hidden="true">${"<td><span></span></td>".repeat(COLUNAS)}</tr>`).join("");
    try {
        funcionarios = await chamarAPI(API);
        renderizar();
    } catch (erro) {
        $("subtituloPagina").textContent = erro.message;
        corpo.innerHTML = linhaVazia(`<strong>Falha ao carregar</strong>${escaparHTML(erro.message)}<br>
            <button type="button" class="secundario" data-recarregar>Tentar de novo</button>`);
    }
}

/* ---------- Formulário ---------- */
function limparErros() {
    erroGeral.hidden = true;
    erroGeral.textContent = "";
    formulario.querySelectorAll(".campo").forEach((c) => c.classList.remove("invalido"));
    formulario.querySelectorAll(".erro-campo").forEach((e) => (e.textContent = ""));
    formulario.querySelectorAll("input").forEach((i) => i.removeAttribute("aria-invalid"));
}
function erroNoCampo(id, mensagem) {
    $(id).closest(".campo").classList.add("invalido");
    $(id).setAttribute("aria-invalid", "true");
    $(`erro-${id}`).textContent = mensagem;
}

function abrirFormulario(item = null) {
    formulario.reset();
    limparErros();
    $("itemId").value = item ? item.id_funcionario : "";
    $("tituloDialogo").textContent = item ? "Editar funcionário" : "Novo funcionário";
    botaoSalvar.textContent = item ? "Salvar alterações" : "Cadastrar funcionário";
    if (item) {
        $("nome").value = item.nome;
        $("cargo").value = item.cargo;
    }
    dialogoCadastro.showModal();
    $("nome").focus();
}

function validar() {
    let primeiro = null;
    const falhar = (campo, msg) => { erroNoCampo(campo, msg); primeiro ??= campo; };
    if (!$("nome").value.trim()) falhar("nome", "Informe o nome.");
    if (!$("cargo").value.trim()) falhar("cargo", "Informe o cargo.");
    if (primeiro) $(primeiro).focus();
    return !primeiro;
}

formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    limparErros();
    if (!validar()) return;

    const id = $("itemId").value;
    const dados = { nome: $("nome").value.trim(), cargo: $("cargo").value.trim() };
    const rotulo = botaoSalvar.textContent;
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando…";
    try {
        const resultado = await chamarAPI(id ? `${API}/${id}` : API, enviarJSON(id ? "PUT" : "POST", dados));
        dialogoCadastro.close();
        avisar(resultado.mensagem);
        await carregar();
    } catch (erro) {
        erroGeral.textContent = erro.message;
        erroGeral.hidden = false;
    } finally {
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = rotulo;
    }
});

/* ---------- Exclusão ---------- */
function pedirExclusao(f) {
    idParaExcluir = f.id_funcionario;
    const bloqueado = f.movimentacoes > 0;
    $("tituloExcluir").textContent = bloqueado ? "Não é possível excluir" : "Excluir funcionário?";
    $("textoExcluir").textContent = bloqueado
        ? `“${f.nome}” tem ${plural(f.movimentacoes, "movimentação", "movimentações")} no histórico. Para manter o histórico completo, ele não pode ser excluído.`
        : `“${f.nome}” será removido da lista. Essa ação não pode ser desfeita.`;
    $("confirmarExclusao").hidden = bloqueado;
    $("cancelarExclusao").textContent = bloqueado ? "Entendi" : "Cancelar";
    dialogoExcluir.showModal();
}

$("confirmarExclusao").addEventListener("click", async () => {
    const id = idParaExcluir;
    dialogoExcluir.close();
    try {
        const resultado = await chamarAPI(`${API}/${id}`, { method: "DELETE" });
        avisar(resultado.mensagem);
        await carregar();
    } catch (erro) {
        avisar(erro.message, "erro");
    }
});
$("cancelarExclusao").addEventListener("click", () => dialogoExcluir.close());

/* ---------- Eventos ---------- */
$("botaoNovo").addEventListener("click", () => abrirFormulario());
$("fecharDialogo").addEventListener("click", () => dialogoCadastro.close());
$("botaoCancelar").addEventListener("click", () => dialogoCadastro.close());
[dialogoCadastro, dialogoExcluir].forEach((d) =>
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
campoBusca.addEventListener("input", renderizar);

corpo.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("button");
    if (!alvo) return;
    if (alvo.hasAttribute("data-abrir-novo")) return abrirFormulario();
    if (alvo.hasAttribute("data-recarregar")) return carregar();
    if (alvo.hasAttribute("data-limpar")) { campoBusca.value = ""; return renderizar(); }

    const linha = alvo.closest("tr[data-id]");
    if (!linha) return;
    const item = funcionarios.find((f) => f.id_funcionario === Number(linha.dataset.id));
    if (alvo.dataset.acao === "editar") abrirFormulario(item);
    else if (alvo.dataset.acao === "excluir") pedirExclusao(item);
});

carregar();