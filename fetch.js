const fs = require('fs').promises;

async function fetchMovies() {
    const url = 'https://apollo.senscritique.com/';
    const headers = {
        "accept": "*/*",
        "accept-language": "fr-FR,fr;q=0.7",
        "authorization": "null",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "pragma": "no-cache"
    };
    const body = JSON.stringify([{
        "operationName": "Poll",
        "variables": {
            "id": 3711061,
            "limit": 100,
            "offset": 0
        },
        "query": `
            query Poll($id: Int!, $limit: Int, $offset: Int) {
            poll(id: $id) {
                products(limit: $limit, offset: $offset) {
                  title
                  originalTitle
                  rating
                  dateRelease
                  displayedYear
                  frenchReleaseDate
                  yearOfProduction
                  medias {
                    picture
                  }
                  category
                  stats {
                    ratingCount
                  }
                }
            }
            }`
    }]);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const jsonResponse = await response.json();
        const products = jsonResponse[0].data.poll.products;
        const today = new Date().toISOString().split('T')[0];

        // Read existing data from file
        let moviesData = {};
        try {
            const data = await fs.readFile('movies.json', 'utf8');
            moviesData = JSON.parse(data);
        } catch (err) {
            console.log('No existing file found, creating new one.');
        }

        // Process and update new data for the current day
        products.forEach((product, index) => {
            const title = product.title;
            if (!moviesData[title]) {
                moviesData[title] = {
                    picture: product.medias.picture,
                    entries: []
                };
            }

            // Find the entry for today's date, if it exists
            const existingEntryIndex = moviesData[title].entries.findIndex(entry => entry.date === today);

            const updatedEntry = {
                date: today,
                rank: index + 1
            };

            if (existingEntryIndex >= 0) {
                // Update existing entry for today
                moviesData[title].entries[existingEntryIndex] = updatedEntry;
            } else {
                // Add new entry for today
                moviesData[title].entries.push(updatedEntry);
            }
        });

        // Save the updated data to the file
        await fs.writeFile('movies.json', JSON.stringify(moviesData, null, 2), 'utf8');
        console.log('Data saved to movies.json');

    } catch (error) {
        console.error('Error fetching or writing data:', error);
    }
}

fetchMovies();
