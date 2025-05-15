module.exports = {
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'text-davinci-003',
        maxTokens: {
            title: 100,
            description: 200,
            content: 300,
            keywords: 200
        },
        temperature: 0.7
    },
    seo: {
        titleLength: {
            min: 30,
            max: 60
        },
        descriptionLength: {
            min: 120,
            max: 160
        },
        keywords: [
            'hydraulik',
            'lublin',
            'instalacje',
            'wodno-kanalizacyjne',
            'ogrzewanie',
            'podłogowe',
            'kotłownie',
            'gazowe',
            'biały montaż',
            'serwis',
            'naprawa',
            'instalacje co',
            'instalacje wodno-kanalizacyjne',
            'ogrzewanie podłogowe',
            'instalacje gazowe',
            'doradztwo techniczne',
            'naprawa instalacji',
            'modernizacja',
            'montaż'
        ]
    }
}; 