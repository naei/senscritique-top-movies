let moviesData = {};
let chart = null;

document.addEventListener('DOMContentLoaded', function () {
    fetch('movies.json')
        .then(response => response.json())
        .then(data => {
            moviesData = data;
            initializeSearch();
        })
        .catch(error => console.error('Error:', error));
});

function initializeSearch() {
    const searchBar = document.getElementById('searchBar');
    const resultsContainer = document.getElementById('searchResults');
    searchBar.addEventListener('input', function (event) {
        const searchTerm = event.target.value.toLowerCase();
        const movieNames = Object.keys(moviesData);
        const filteredMovies = movieNames.filter(name => name.toLowerCase().startsWith(searchTerm));

        // Clear previous results
        resultsContainer.innerHTML = '';

        // Create and display filtered list
        filteredMovies.forEach(movie => {
            const resultItem = document.createElement('div');
            resultItem.innerText = movie;
            resultItem.classList.add('search-result-item');
            resultItem.addEventListener('click', () => {
                renderChart(movie);
                resultsContainer.innerHTML = ''; // Clear results after selection
                searchBar.value = movie; // Optional: fill search bar with selected movie name
            });
            resultsContainer.appendChild(resultItem);
        });
    });

}

function renderChart(movieTitle) {
    const ctx = document.getElementById('rankingChart').getContext('2d');
    const movieRankings = moviesData[movieTitle].map(entry => ({
        x: new Date(entry.date),
        y: entry.rank
    }));
    if (chart) {
        chart.destroy(); // Destroy the previous chart
    }

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: movieTitle,
                data: movieRankings,
                fill: false,
                borderColor: 'blue',
                tension: 0.1
            }]
        },
        options: {
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
                    }
                },
                y: {
                    reverse: true, // Lower rankings are better
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Rank'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true
                }
            }
        }
    });
}