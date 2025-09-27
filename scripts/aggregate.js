const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration - now case-insensitive
const PLATFORMS = ['Codechef', 'Gfg', 'Leetcode', 'Hackerrank'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const OUTPUT_FILE = 'dashboard.json';

// Helper function to get the last Git commit date for a path
async function getGitLastModified(filePath) {
    try {
        const { stdout } = await execAsync(
            `git log -1 --format=%cI -- "${filePath}"`,
            { cwd: process.cwd() }
        );
        const dateStr = stdout.trim();
        return dateStr ? new Date(dateStr) : new Date();
    } catch (error) {
        console.warn(`Warning: Could not get git history for ${filePath}`);
        // Fallback to file system time
        try {
            const stats = await fs.stat(filePath);
            return stats.mtime;
        } catch {
            return new Date();
        }
    }
}

// Helper function to find directories case-insensitively
async function findDirectory(parentPath, targetName) {
    try {
        const items = await fs.readdir(parentPath);
        const found = items.find(item => 
            item.toLowerCase() === targetName.toLowerCase()
        );
        return found ? path.join(parentPath, found) : null;
    } catch {
        return null;
    }
}

// Helper function to find files with specific patterns
async function findFile(dir, patterns) {
    try {
        const files = await fs.readdir(dir);
        for (const pattern of patterns) {
            const file = files.find(f => {
                const lower = f.toLowerCase();
                return lower.includes(pattern) || lower.endsWith(pattern);
            });
            if (file) return path.join(dir, file);
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Helper function to read file content safely
async function readFileSafe(filePath) {
    try {
        if (!filePath) return '';
        const content = await fs.readFile(filePath, 'utf8');
        return content.trim();
    } catch (error) {
        console.warn(`Warning: Could not read file ${filePath}`);
        return '';
    }
}

// Helper function to generate a unique ID for each problem
function generateProblemId(platform, difficulty, problemName) {
    return `${platform.toLowerCase()}-${difficulty.toLowerCase()}-${problemName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

// Main aggregation function
async function aggregateData() {
    const dashboard = [];
    console.log('Starting aggregation...');
    console.log('Current working directory:', process.cwd());
    
    // First, let's see what directories exist in the root
    const rootItems = await fs.readdir(process.cwd());
    console.log('Root directory contents:', rootItems);
    
    for (const platform of PLATFORMS) {
        const platformPath = await findDirectory(process.cwd(), platform);
        
        if (!platformPath) {
            console.log(`Platform directory ${platform} not found, skipping...`);
            continue;
        }
        
        console.log(`Found platform directory: ${platformPath}`);
        
        for (const difficulty of DIFFICULTIES) {
            const difficultyPath = await findDirectory(platformPath, difficulty);
            
            if (!difficultyPath) {
                console.log(`Difficulty directory ${platform}/${difficulty} not found, skipping...`);
                continue;
            }
            
            console.log(`Found difficulty directory: ${difficultyPath}`);
            
            // Get all problem directories
            const problemDirs = await fs.readdir(difficultyPath);
            console.log(`Problems in ${platform}/${difficulty}:`, problemDirs);
            
            for (const problemName of problemDirs) {
                const problemPath = path.join(difficultyPath, problemName);
                
                // Check if it's a directory
                const stat = await fs.stat(problemPath);
                if (!stat.isDirectory()) continue;
                
                console.log(`Processing: ${platform}/${difficulty}/${problemName}`);
                
                // Get the last Git commit date for this problem directory
                const lastModified = await getGitLastModified(problemPath);
                console.log(`Last modified: ${lastModified.toISOString()}`);
                
                // Find the files - expanded patterns
                const codeFile = await findFile(problemPath, [
                    '.js', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.ts',
                    'solution', 'code', 'main', 'answer', 'program'
                ]);
                
                const readmeFile = await findFile(problemPath, [
                    'readme.md', 'question.md', 'problem.md', 'readme',
                    'README.md', 'QUESTION.md', 'PROBLEM.md', 'README'
                ]);
                
                const notesFile = await findFile(problemPath, [
                    'notes.md', 'ai-notes.md', 'ai_notes.md', 'ainotes.md',
                    'NOTES.md', 'AI-NOTES.md', 'AI_NOTES.md', 'AINOTES.md',
                    'note.md', 'NOTE.md'
                ]);
                
                console.log(`Found files - Code: ${codeFile ? 'Yes' : 'No'}, Readme: ${readmeFile ? 'Yes' : 'No'}, Notes: ${notesFile ? 'Yes' : 'No'}`);
                
                // Read file contents
                const codeContent = await readFileSafe(codeFile);
                const readmeContent = await readFileSafe(readmeFile);
                const notesContent = await readFileSafe(notesFile);
                
                // Determine code language from file extension
                let language = 'unknown';
                if (codeFile) {
                    const ext = path.extname(codeFile).toLowerCase();
                    const langMap = {
                        '.js': 'javascript',
                        '.ts': 'typescript',
                        '.py': 'python',
                        '.java': 'java',
                        '.cpp': 'cpp',
                        '.c': 'c',
                        '.go': 'go',
                        '.rs': 'rust'
                    };
                    language = langMap[ext] || 'unknown';
                }
                
                // Create the problem object with unique ID
                const problemData = {
                    id: generateProblemId(platform, difficulty, problemName),
                    platform,
                    difficulty,
                    problemName,
                    language,
                    files: {
                        code: codeContent,
                        readme: readmeContent,
                        notes: notesContent
                    },
                    hasCode: !!codeContent,
                    hasReadme: !!readmeContent,
                    hasNotes: !!notesContent,
                    lastUpdated: lastModified.toISOString()
                };
                
                dashboard.push(problemData);
            }
        }
    }
    
    // Sort the dashboard for consistent output
    dashboard.sort((a, b) => {
        if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
        if (a.difficulty !== b.difficulty) {
            const diffOrder = { 'Easy': 0, 'Medium': 1, 'Hard': 2 };
            return diffOrder[a.difficulty] - diffOrder[b.difficulty];
        }
        return a.problemName.localeCompare(b.problemName);
    });
    
    // Write the dashboard file
    const output = {
        metadata: {
            totalProblems: dashboard.length,
            lastUpdated: new Date().toISOString(),
            breakdown: {}
        },
        problems: dashboard
    };
    
    // Calculate breakdown statistics
    for (const platform of PLATFORMS) {
        output.metadata.breakdown[platform] = {
            total: 0,
            Easy: 0,
            Medium: 0,
            Hard: 0
        };
    }
    
    for (const problem of dashboard) {
        output.metadata.breakdown[problem.platform].total++;
        output.metadata.breakdown[problem.platform][problem.difficulty]++;
    }
    
    await fs.writeFile(
        path.join(process.cwd(), OUTPUT_FILE),
        JSON.stringify(output, null, 2)
    );
    
    console.log(`\nAggregation complete! Written to ${OUTPUT_FILE}`);
    console.log(`Total problems processed: ${dashboard.length}`);
    
    // Show summary
    if (dashboard.length === 0) {
        console.log('\nNo problems found. Please check:');
        console.log('1. Directory structure matches: Platform/Difficulty/ProblemName/');
        console.log('2. Platform names (case-insensitive): Codechef, Gfg, Leetcode, Hackerrank');
        console.log('3. Difficulty names (case-insensitive): Easy, Medium, Hard');
    }
}

// Run the aggregation
aggregateData().catch(error => {
    console.error('Error during aggregation:', error);
    process.exit(1);
});
