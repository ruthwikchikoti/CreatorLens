import { apiKey } from './exports.js';
var parts = ['statistics', 'snippet', 'contentDetails'];
var itemArray = [];
var videoStats = [];
const grid = document.getElementById('analyticsGrid');
const cardTemplate = document.getElementById('metric-card-template');

for (let i = 0; i < 2; i++) {
    grid.append(cardTemplate.content.cloneNode(true))
}    

let firstResults = [];

(async function () {   
    try {
        var currentTab = await getCurrentTab();
        let response = await fetch(currentTab.url);
        let htmlString = await response.text();

        var chanId = '';
        chanId = htmlString.match(/,"externalChannelId":"([^".]*)/);
        if(chanId == null) {
            chanId = htmlString.match(/,"externalId":"([^".]*)/);
        }else if (chanId == null) {
            chanId = htmlString.match(/,\"channelId\":\"([^".]*)/);
        }
        console.log(chanId);
        
        var uploadPlaylist = "UU" + chanId[1].substring(2);
        var nextToken = '';
        do {
            var vids = await channelData(apiKey, uploadPlaylist, nextToken);
            if(vids.nextPage == ''){
                break;
            }else{ 
                nextToken = vids.nextPage;
            }

            var vidsData = await videoData(apiKey, vids.itemArray, parts);

        } while (new Date(Math.min(...videoStats.map(vidDates =>
            new Date(vidDates.date)))) >= new Date((new Date().setDate(new Date().getDate() - 90))));
        
    } catch(err) {
        document.getElementById("headAlert").innerText = '(Go to a YouTube Channel)';
        console.log(err);
        grid.innerHTML = '';
    }

    console.log(vidsData[0].channel);
    try{
        firstResults = [
            last12Stats(vidsData), 
            last90Days(vidsData),
            {
                name: "Channel Health Metrics",
                explanation: "Overall channel engagement rate and upload consistency metrics",
                results: {
                    "Engagement Rate": getEngagementRate(videoStats) + "%",
                    "Avg Days Between Uploads": getUploadConsistency(videoStats)
                }
            }
        ];
        document.getElementById('channelName').textContent = vidsData[0].channel;
        grid.innerHTML = '';
        
        for (const result of firstResults) {
            const card = cardTemplate.content.cloneNode(true);
            const title = card.querySelector('.metric-title');
            const details = card.querySelector('.metric-details');
            
            title.textContent = result.name;
            
            for (const [metric, value] of Object.entries(result.results)) {
                const metricDiv = document.createElement('div');
                metricDiv.className = 'metric-row';
                metricDiv.innerHTML = `
                    <span class="metric-label">${metric}:</span>
                    <span class="metric-value">${value}</span>
                `;
                details.appendChild(metricDiv);
            }
            
            grid.appendChild(card);
        }
        
        const mostPopularVideo = getMostPopularVideo(videoStats);
        if (mostPopularVideo) {
            document.getElementById('popular-video-details').innerHTML = `
                <p>Title: ${mostPopularVideo.title}</p>
                <p>Views: ${mostPopularVideo.views.toLocaleString()}</p>
                <p>Likes: ${mostPopularVideo.likes.toLocaleString()}</p>
                <p>Comments: ${mostPopularVideo.comments.toLocaleString()}</p>
            `;
        }

    }catch(err){
        document.getElementById('channelAlert').textContent = 
            `Statistics Unavailable for ${vidsData[0].channel}`;
        console.error(err);
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.add(`${savedTheme}-mode`);
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `${savedTheme}-mode`);
    });
});

document.getElementById('light-mode').addEventListener('click', () => {
    document.body.classList.add('light-mode');
    document.body.classList.remove('dark-mode');
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === 'light-mode');
    });
    localStorage.setItem('theme', 'light');
});

document.getElementById('dark-mode').addEventListener('click', () => {
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === 'dark-mode');
    });
    localStorage.setItem('theme', 'dark');
});

document.getElementById('export-btn').addEventListener('click', () => {
    if (!firstResults.length) {
        alert('No data available to export');
        return;
    }

    const formatNumber = (num) => num.toLocaleString('en-US');

    const data = {
        channelInfo: {
            name: document.getElementById('channelName').textContent,
            exportDate: new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        },
        analytics: firstResults.map(result => ({
            category: result.name,
            description: result.explanation,
            metrics: Object.entries(result.results).map(([key, value]) => ({
                metric: key,
                value: value
            }))
        })),
        popularVideo: (() => {
            const video = getMostPopularVideo(videoStats);
            return video ? {
                title: video.title,
                statistics: {
                    views: formatNumber(video.views),
                    likes: formatNumber(video.likes),
                    comments: formatNumber(video.comments),
                    publishedAt: new Date(video.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })
                }
            } : null;
        })()
    };

    const fileName = `${data.channelInfo.name.replace(/\s+/g, '_')}_analytics_${new Date().toISOString().split('T')[0]}.json`;
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

async function getCurrentTab() {
    let queryOptions = { active: true, currentWindow: true };
    let [tab] = await chrome.tabs.query(queryOptions);

    return tab;
}

async function channelData(key, playlistId, tokenId) {
    let urlString =
        "https://www.googleapis.com/youtube/v3/playlistItems" +
        `?key=${key}&playlistId=${playlistId}&part=contentDetails&maxResults=50&pageToken=${tokenId}`;
    let response = await fetch(urlString);
    if (!response.ok) {
        throw new Error(await response.text());
    }

    let channelVids = await response.json();
    for(var key in channelVids.items) {
        itemArray[key] = channelVids.items[key].contentDetails.videoId;
    }
    let nextPage = channelVids.nextPageToken;
    return {
        'itemArray' : itemArray, 
        'nextPage' : nextPage
    };
}

async function videoData(key, vidIds, parts) {
    videoStats = [];
    let urlString =
        "https://www.googleapis.com/youtube/v3/videos" +
        `?key=${key}&id=${vidIds.join()}&part=${parts.join()}`;
    let response = await fetch(urlString);
    if (!response.ok) {
        throw new Error(await response.text());
    }

    let vidsData = await response.json();
    let keyNumber = 0;
    for(let key in vidsData.items) {
        if(videoStats.length > 0) {
            keyNumber = videoStats.length;
        }

        videoStats.push({
            number: keyNumber,
            key: vidsData.items[key].id,
            title: vidsData.items[key].snippet.title,
            channel: vidsData.items[key].snippet.channelTitle,
            channelId: vidsData.items[key].snippet.channelId,
            views: Number(vidsData.items[key].statistics.viewCount),
            likes: Number(vidsData.items[key].statistics.likeCount),
            comments: Number(vidsData.items[key].statistics.commentCount),
            date: vidsData.items[key].snippet.publishedAt,
            length: vidsData.items[key].contentDetails.duration
            })     
    };

    return(videoStats);
}

function last12Stats(stats) {
    let i = 0
    let last12Vids = [];
    stats.sort((a, b) => a.date - b.date);
    for(let key = 0; last12Vids.length < 10; key++){
        if (stats[key].length.includes('M')) {
            last12Vids[i] = stats[key];
            i++;
        }
    }
    last12Vids.sort((a, b) => a.views - b.views);    
    last12Vids.shift();
    last12Vids.pop();
    let avgViews = last12Vids.reduce((a, b) => a + b.views, 0) / last12Vids.length;
    let avgLikes = last12Vids.reduce((a, b) => a + b.likes, 0) / last12Vids.length;
    let avgComments = last12Vids.reduce((a, b) => a + b.comments, 0) / last12Vids.length;
    
    return {
        name: "Last 10 Videos Statistics",
        explanation: "This extension takes the last 10 uploaded videos, removes the two with the highest and lowest view count, then calculates average views, likes, and comments for the middle 10 videos.  'Shorts' are excluded from the extension.",
        results : {
            "Average Views" : avgViews.toLocaleString("en", {maximumFractionDigits: 0}),
            "Average Likes" : avgLikes.toLocaleString("en", {maximumFractionDigits: 0}),
            "Average Comments" : avgComments.toLocaleString("en", {maximumFractionDigits: 0})
        }
    }
}

function last90Days(stats) {
    let i = 0
    let last90Vids = [];
    let minDate = new Date();
    let maxDate = new Date();
    minDate.setDate(minDate.getDate() - 15);
    maxDate.setDate(maxDate.getDate() - 90);
    stats.sort((a, b) => a.date - b.date);
    for(let key in stats){
        if (stats[key].length.includes('M') && new Date(stats[key].date) <= minDate && new Date(stats[key].date) >= maxDate) {
            last90Vids[i] = stats[key];
            i++;
        } 
    } 
    let avgViews = last90Vids.reduce((a, b) => a + b.views, 0) / last90Vids.length;
    let avgLikes = last90Vids.reduce((a, b) => a + b.likes, 0) / last90Vids.length;
    let avgComments = last90Vids.reduce((a, b) => a + b.comments, 0) / last90Vids.length;

    return {
        name: "Last 90 Days Statistics",
        explanation: "This extension takes the videos uploaded 15 to 90 days ago from today, and calculates average views, likes, and comments. 'Shorts' are excluded from the extension.",
        results: {
            "Average Views": avgViews.toLocaleString("en", { maximumFractionDigits: 0 }),
            "Average Likes": avgLikes.toLocaleString("en", { maximumFractionDigits: 0 }),
            "Average Comments": avgComments.toLocaleString("en", { maximumFractionDigits: 0 }) 
        }
    }
}

function getEngagementRate(stats) {
    console.log("Stats length:", stats.length);
    console.log("Sample video data:", stats[0]);

    if (!stats || stats.length === 0) {
        console.log("No stats available");
        return 0;
    }

    const validVideos = stats.filter(video => 
        video && 
        video.views && 
        video.views > 0 && 
        typeof video.likes === 'number' && 
        typeof video.comments === 'number'
    );

    console.log("Valid videos count:", validVideos.length);

    if (validVideos.length === 0) {
        return 0;
    }

    const totalEngagement = validVideos.reduce((sum, video) => {
        const likes = video.likes || 0;
        const comments = video.comments || 0;
        const engagementRate = ((likes + comments) / video.views) * 100;
        console.log(`Video engagement: ${engagementRate}% (${likes} likes + ${comments} comments / ${video.views} views)`);
        return sum + engagementRate;
    }, 0);

    return (totalEngagement / validVideos.length).toFixed(2);
}

function getUploadConsistency(stats) {
    let dates = stats.map(video => new Date(video.date));
    let gaps = [];
    dates.sort((a, b) => b - a);
    
    for (let i = 1; i < dates.length; i++) {
        gaps.push(Math.abs(dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
    }
    
    return Math.round(gaps.reduce((a, b) => a + b) / gaps.length);
}


function getMostPopularVideo(stats) {
    if (!stats || stats.length === 0) return null;
    return stats.reduce((max, video) => (video.views > max.views ? video : max), stats[0]);
}
