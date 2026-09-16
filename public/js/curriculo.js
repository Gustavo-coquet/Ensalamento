/* Grade curricular fixa, só pra montar o quadro visual de Turmas — não muda como as
   turmas são salvas, é só "em que período essa disciplina cai". O Ciclo Básico (1º ao
   4º) é o mesmo pros dois cursos; Eng. Civil e Eng. Produção divergem a partir do 5º.
   Uma disciplina do ciclo básico aparece nos dois quadros (mesmo professor repetido). */

const GRADE_CICLO_BASICO = [
  ['Física Geral e Experimental I', 'Cálculo Básico', 'Algebra Linear e Geometria Analítica',
    'Gestão de Empresas e Empreendedorismo', 'Optativa Complementar', 'Atividade Integradora I'],
  ['Física Geral e Experimental II', 'Cálculo Diferencial e Integral I', 'Lógica de Programação',
    'Desenho Técnico', 'Gestão Ambiental e Sustentabilidade', 'Atividade Integradora II'],
  ['Física Geral e Experimental III', 'Cálculo Diferencial e Integral II', 'Mecânica Aplicada',
    'CAD', 'Química Geral e Experimental', 'Atividade Integradora III'],
  ['Tecnologia Eletrotécnica', 'Equações Diferenciais', 'Ciência dos Materiais',
    'Cálculo Numérico', 'Probabilidade e Estatística', 'Atividade Integradora IV'],
]

const GRADE_ENG_CIVIL = [
  ['Fundamentos de Arquitetura', 'Fenômenos de Transporte', 'Resistência de Materiais I',
    'Materiais de Construção', 'Geologia', 'Atividade Integradora V'],
  ['Custos e Preços', 'Hidráulica', 'Resistência de Materiais II',
    'Estruturas Hiperestáticas', 'Mecânica dos Solos I', 'Atividade Integradora VI'],
  ['Instalações Elétricas', 'Instalações Hidrosanitárias', 'Estruturas de Concreto I',
    'Topografia', 'Mecânica dos Solos II', 'Atividade Integradora VII'],
  ['Tecnologia e Processos Construtivos', 'Saneamento e Abastecimento', 'Estruturas de Concreto II',
    'Estradas', 'Fundações', 'Atividade Integradora VIII'],
  ['Trabalho de Conclusão de Curso I', 'Optativa Profissional', 'Estruturas de Aço e Madeira',
    'Transporte e Logística', 'Atividade Complementar', 'Atividade Integradora IX'],
  ['Trabalho de Conclusão de Curso II', 'Estágio Supervisionado', 'Pontes', 'Atividade Integradora X'],
]

const GRADE_ENG_PRODUCAO = [
  ['Instalações Elétricas', 'Fenômenos de Transporte', 'Resistência de Materiais I',
    'Pesquisa Operacional I (PO1)', 'Gestão Estratégica da Produção', 'Atividade Integradora V'],
  ['Energias Renováveis', 'Engenharia de Métodos', 'Materiais e Processos de Fabricação',
    'Análise e Simulação de Sistemas (PO2)', 'Pessoas e Conhecimento', 'Atividade Integradora VI'],
  ['Sistemas e Ferramentas da Qualidade', 'Engenharia do Produto', 'Transporte e Logística',
    'Projeto de Sistemas Produtivos (PO3)', 'Custos e Preços', 'Atividade Integradora VII'],
  ['Planejamento e Controle da Produção', 'Ergonomia e Segurança do Trabalho', 'Gestão de Processos Produtivos',
    'Optativa Profissional', 'Mercado Financeiro', 'Atividade Integradora VIII'],
  ['Trabalho de Conclusão de Curso I', 'Arranjo Físico e Industrial', 'Sistemas Produtivos',
    'Controle Estatístico de Processos', 'Atividade Complementar', 'Atividade Integradora IX'],
  ['Trabalho de Conclusão de Curso II', 'Estágio Supervisionado', 'Automação da Produção', 'Atividade Integradora X'],
]

/** Grade completa (1º ao 10º) de um curso: ciclo básico + o específico dele. */
function gradeDoCurso(curso) {
  const especifica = curso === 'ENG_CIVIL' ? GRADE_ENG_CIVIL : GRADE_ENG_PRODUCAO
  return [...GRADE_CICLO_BASICO, ...especifica]
}

/** nome da disciplina (chave simples, sem acento/caixa) -> período (1-based) nesse curso. */
function indicePeriodos(curso) {
  const indice = new Map()
  gradeDoCurso(curso).forEach((disciplinas, i) => {
    disciplinas.forEach((nome) => indice.set(chaveSimples(nome), i + 1))
  })
  return indice
}
