// ============================================================
// TA-Intake Portal — Embedded Legal Data
// Extracted from law-sources-baseline.md + judicial-viewpoints.md
// ============================================================

var LEGAL_DATA = {
  laws: [
    {
      id: 'law-1',
      name: '中华人民共和国民法典',
      version: '2021年1月1日施行',
      category: '法律',
      source: '全国人大',
      sourceUrl: 'https://www.npc.gov.cn/npc/c30834/',
      articles: [
        { no: '第1165条', title: '过错责任原则', summary: '行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任' },
        { no: '第1179条', title: '人身损害赔偿范围', summary: '侵害他人造成人身损害的12项赔偿范围' },
        { no: '第1208-1217条', title: '机动车交通事故责任', summary: '机动车交通事故责任的特别规定' },
        { no: '第1217条', title: '好意同乘', summary: '无偿搭乘非营运机动车造成损害的，应当减轻驾驶人赔偿责任' },
        { no: '第188条', title: '诉讼时效', summary: '向人民法院请求保护民事权利的诉讼时效期间为三年' }
      ]
    },
    {
      id: 'law-2',
      name: '中华人民共和国道路交通安全法',
      version: '2021年修正',
      category: '法律',
      source: '全国人大',
      sourceUrl: 'https://www.npc.gov.cn/npc/c30834/',
      articles: [
        { no: '第76条', title: '机动车交通事故赔偿责任', summary: '机动车发生交通事故造成人身伤亡、财产损失的赔偿规则；机动车与行人/非机动车的归责原则' }
      ]
    },
    {
      id: 'law-3',
      name: '中华人民共和国刑法',
      version: '最新修正',
      category: '法律',
      source: '全国人大',
      sourceUrl: 'https://www.npc.gov.cn/npc/c30834/',
      articles: [
        { no: '第133条', title: '交通肇事罪', summary: '违反交通运输管理法规，因而发生重大事故的，三档量刑' },
        { no: '第133条之一', title: '危险驾驶罪', summary: '醉酒驾驶等危险驾驶行为' }
      ]
    },
    {
      id: 'law-4',
      name: '中华人民共和国保险法',
      version: '2015年修正',
      category: '法律',
      source: '全国人大',
      sourceUrl: 'https://www.npc.gov.cn/npc/c30834/',
      articles: [
        { no: '第17条', title: '免责条款提示说明义务', summary: '保险人对免责条款应尽提示说明义务，否则该条款不产生效力' },
        { no: '第26条', title: '保险理赔时效', summary: '人寿保险5年，非人寿保险2年' },
        { no: '第65条', title: '责任保险直接赔付', summary: '责任保险中受害人可直接向保险人请求赔偿' }
      ]
    },
    {
      id: 'law-5',
      name: '中华人民共和国工伤保险条例',
      version: '2010年修订',
      category: '法律',
      source: '全国人大',
      sourceUrl: 'https://www.npc.gov.cn/npc/c30834/',
      articles: [
        { no: '第17条', title: '工伤认定申请时限', summary: '用人单位30日内申请；个人1年内申请' },
        { no: '第14条第6项', title: '上下班途中工伤', summary: '在上下班途中，受到非本人主要责任的交通事故伤害的，应当认定为工伤' }
      ]
    },
    {
      id: 'law-6',
      name: '中华人民共和国民事诉讼法',
      version: '2023年修正',
      category: '法律',
      source: '全国人大',
      sourceUrl: 'https://www.npc.gov.cn/npc/c30834/',
      articles: [
        { no: '第104条', title: '诉前财产保全', summary: '利害关系人可在起诉前申请财产保全' }
      ]
    }
  ],

  judicialInterpretations: [
    {
      id: 'ji-1',
      name: '最高人民法院关于审理道路交通事故损害赔偿案件适用法律若干问题的解释（一）',
      version: '法释〔2020〕17号，2020年修正',
      category: '司法解释',
      effectiveDate: '2021.1.1',
      source: '最高人民法院',
      sourceUrl: 'https://www.court.gov.cn/fabu/xiangqing/293670.html',
      keyPoints: [
        '交强险赔付规则',
        '挂靠连带责任（第3条）',
        '赔偿范围',
        '保险公司作为共同被告（第25条）'
      ]
    },
    {
      id: 'ji-2',
      name: '最高人民法院关于审理道路交通事故损害赔偿案件适用法律若干问题的解释（二）',
      version: '2025年施行',
      category: '司法解释',
      effectiveDate: '2025',
      source: '最高人民法院',
      sourceUrl: 'https://www.court.gov.cn/',
      keyPoints: [
        '第1条：租赁借用机动车，车主有过错的承担相应责任',
        '第2条："开门杀"由保险公司承担',
        '第3条：好意同乘减轻驾驶人责任',
        '第4条：驾驶证超过有效期不免除保险赔偿',
        '第5条：工程机械参照机动车管理，适用交强险',
        '第6条：超退休年龄人员误工费获支持',
        '第7条：经营性车辆停运损失计算标准',
        '第8条：非机动车与机动车对等归责',
        '第9条：保险公司承担诉讼费用',
        '第10条：社保基金追偿权',
        '第11条：非机动车交强险参照适用',
        '第12条：新旧法衔接规则'
      ]
    },
    {
      id: 'ji-3',
      name: '最高人民法院关于确定民事侵权精神损害赔偿责任若干问题的解释',
      version: '2020年修正',
      category: '司法解释',
      effectiveDate: '2021.1.1',
      source: '最高人民法院',
      sourceUrl: 'https://www.court.gov.cn/',
      keyPoints: ['精神损害抚慰金的确定标准']
    },
    {
      id: 'ji-4',
      name: '最高人民法院关于审理人身损害赔偿案件适用法律若干问题的解释',
      version: '2022年修正',
      category: '司法解释',
      effectiveDate: '2022',
      source: '最高人民法院',
      sourceUrl: 'https://www.court.gov.cn/',
      keyPoints: ['各项赔偿计算公式', '城镇/农村统一标准']
    }
  ],

  regulations: [
    {
      id: 'reg-1',
      name: '道路交通事故处理程序规定',
      version: '公安部令第146号',
      category: '行政法规',
      source: '公安部',
      sourceUrl: 'https://www.mps.gov.cn/',
      keyPoints: ['第71条：事故认定复核3日期限']
    },
    {
      id: 'reg-2',
      name: '机动车交通事故责任强制保险条例',
      version: '2019年修正',
      category: '行政法规',
      source: '全国人大',
      sourceUrl: 'https://www.npc.gov.cn/npc/c30834/',
      keyPoints: ['交强险赔偿限额', '免责事由']
    },
    {
      id: 'reg-3',
      name: '机动车交通事故责任强制保险责任限额',
      version: '2020年9月调整后',
      category: '行政法规',
      source: '银保监会',
      sourceUrl: 'https://www.cbirc.gov.cn/',
      keyPoints: ['死亡伤残18万', '医疗1.8万', '财产2000元']
    }
  ],

  compensationStandards: {
    liaoning: {
      province: '辽宁省',
      year: '2024年度',
      unified: true,
      unifiedNote: '自2020年1月1日起统一适用城镇居民标准',
      data: [
        { item: '城镇居民人均可支配收入', value: 47982, unit: '元/年' },
        { item: '城镇居民人均消费支出', value: 30350, unit: '元/年' },
        { item: '城镇非私营单位就业人员年平均工资', value: 102239, unit: '元/年' },
        { item: '丧葬费标准', value: 51119.5, unit: '元' }
      ],
      source: '辽宁省统计局',
      sourceUrl: 'https://tjj.ln.gov.cn/tjsj/tjgb/'
    }
  },

  insuranceLimits: {
    withLiability: { death: 180000, medical: 18000, property: 2000, total: 200000 },
    withoutLiability: { death: 18000, medical: 1800, property: 100, total: 19900 }
  },

  deadlines: [
    { item: '人身损害赔偿诉讼时效', period: '3年', basis: '《民法典》第188条' },
    { item: '财产损失赔偿诉讼时效', period: '3年', basis: '《民法典》第188条' },
    { item: '工伤认定申请（单位）', period: '30日', basis: '《工伤保险条例》第17条' },
    { item: '工伤认定申请（个人）', period: '1年', basis: '《工伤保险条例》第17条' },
    { item: '事故认定复核', period: '3日', basis: '《道路交通事故处理程序规定》第71条' },
    { item: '行政复议', period: '60日', basis: '《行政复议法》' },
    { item: '行政诉讼', period: '6个月', basis: '《行政诉讼法》' },
    { item: '保险理赔（非人寿）', period: '2年', basis: '《保险法》第26条' },
    { item: '保险理赔（人寿）', period: '5年', basis: '《保险法》第26条' }
  ],

  liabilityRatios: {
    vehicleVsPedestrian: [
      { liability: '机动车全责', ratio: '100%' },
      { liability: '机动车主责', ratio: '70%' },
      { liability: '同等责任', ratio: '50%' },
      { liability: '机动车次责', ratio: '30%' },
      { liability: '机动车无责', ratio: '不超过10%' }
    ],
    vehicleVsVehicle: [
      { liability: '全责 vs 无责', ratio: '100% : 0%' },
      { liability: '主责 vs 次责', ratio: '70% : 30%' },
      { liability: '同等责任', ratio: '50% : 50%' }
    ]
  },

  compensationItems: [
    { no: 1, name: '医疗费', formula: '实际发生额（凭发票）', note: '含后续治疗费' },
    { no: 2, name: '住院伙食补助费', formula: '住院天数 × 当地标准（一般100元/天）', note: '' },
    { no: 3, name: '营养费', formula: '营养期 × 当地标准（一般30-50元/天）', note: '需医嘱或鉴定' },
    { no: 4, name: '护理费', formula: '护理人数 × 护理天数 × 护理标准', note: '有收入按实际损失，无收入按当地护工标准' },
    { no: 5, name: '误工费', formula: '误工期 × 收入标准', note: '有固定收入按实际减少，无固定按近三年平均或同行业平均' },
    { no: 6, name: '残疾赔偿金', formula: '伤残等级系数 × 赔偿年限 × 年收入标准', note: '60岁以下20年；60-75岁 20-(年龄-60)；75以上5年' },
    { no: 7, name: '死亡赔偿金', formula: '赔偿年限 × 年收入标准', note: '同年龄规则' },
    { no: 8, name: '被扶养人生活费', formula: '年消费额 × 扶养年限 × 系数 ÷ 扶养义务人数', note: '未成年至18岁；60以上递减；75以上5年' },
    { no: 9, name: '精神损害抚慰金', formula: '伤残等级 × 当地标准', note: '一般每级5000-10000元' },
    { no: 10, name: '残疾辅助器具费', formula: '器具价格 × 更换周期', note: '需鉴定或医嘱' },
    { no: 11, name: '丧葬费', formula: '受诉法院地上年度职工月平均工资 × 6', note: '' },
    { no: 12, name: '交通费', formula: '实际发生额（凭票据）', note: '一般20元/天' }
  ],

  courtFeeCalc: [
    { range: '1万以下', formula: '50元' },
    { range: '1-10万', formula: '标的×2.5%-200' },
    { range: '10-20万', formula: '标的×2%+300' },
    { range: '20-50万', formula: '标的×1.5%+1300' },
    { range: '50-100万', formula: '标的×1%+3800' },
    { range: '100-200万', formula: '标的×0.9%+4800' },
    { range: '200-500万', formula: '标的×0.8%+6800' },
    { range: '500-1000万', formula: '标的×0.7%+11800' },
    { range: '1000-2000万', formula: '标的×0.6%+21800' },
    { range: '2000万以上', formula: '标的×0.5%+41800' }
  ],

  judicialTrends: [
    {
      category: '民事赔偿',
      trends: [
        { title: '精细化', desc: '赔偿项目标准化逐项审查；误工费区分有/无固定收入/超退休年龄；护理费区分住院期间/出院后' },
        { title: '规范化', desc: '城乡赔偿标准统一（"同命同价"），自2020年起全国多数省份统一适用城镇居民标准' },
        { title: '人性化', desc: '好意同乘减轻责任鼓励互助；超退休年龄误工费获支持；法院对事故认定书实质审查' }
      ]
    },
    {
      category: '刑事裁判',
      trends: [
        { title: '证据裁判主义', desc: '法院对事故认定书进行实质性审查（标志案例：刘某江交通肇事宣告无罪案）' },
        { title: '逃逸情节区分', desc: '区分"定罪情节"与"量刑情节"，避免重复评价' },
        { title: '量刑规范化', desc: '三档量刑精细化；从宽情节：自首、立功、积极赔偿、取得谅解' }
      ]
    }
  ],

  typicalCases: [
    {
      title: '超退休年龄人员误工费获支持',
      facts: '金某（65岁）在交通事故中受伤，主张误工费。保险公司以超过退休年龄为由拒绝。',
      ruling: '法院认为超退休年龄不等于丧失劳动能力，金某实际从事农业劳动并有收入，支持误工费。',
      insight: '司法解释二第6条已明确此规则，接案时不应因受害人超退休年龄而排除误工费主张。'
    },
    {
      title: '逃逸情节认定——刘某江交通肇事宣告无罪案',
      facts: '刘某江驾车发生事故后离开现场，被认定逃逸。',
      ruling: '法院经审查认为刘某江离开现场有合理理由（不知发生事故），不构成逃逸，宣告无罪。',
      insight: '法院对事故认定书的实质性审查日益加强，"逃逸"认定不再是铁板一块。'
    },
    {
      title: '醉酒驾驶罪名认定——杜某案',
      facts: '杜某醉酒驾驶发生交通事故，涉及交通肇事罪与以危险方法危害公共安全罪的竞合。',
      ruling: '法院认定杜某主观上为过失，以交通肇事罪定罪。',
      insight: '主观过错的证明标准是"排除一切合理怀疑"的最高标准。'
    }
  ]
};
