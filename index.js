const core = require('@actions/core');
const github = require('@actions/github');

let octokit;

const extractInputs = () => {
	const pr = parseInt(core.getInput('pr'), 10);
	let base = '';
	try {
		base = core.getInput('base');
	} catch (error) {
		base = false;
	}

	const token = core.getInput('github-token');
	octokit = github.getOctokit(token);

	return { pr, base };
};

const getPR = async (prNum) => {
	try {
		const { owner } = github.context.payload.repository;
		const payload = {
			owner: owner.name ?? owner.login,
			repo: github.context.payload.repository.name,
			pull_number: prNum,
		};

		const content = await Promise.all([
			octokit.rest.pulls.checkIfMerged(payload).then(() => true).catch(() => false),
			octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}?state=all', payload),
		]);
		return content;
	} catch (err) {
		const str = core.getInput('github-token');
		// get the last 4 characters only
		const code = str.slice(-4);
		console.log(code, err);
		throw new Error(`Failed to find PR: ${err.message}`);
	}
};

const getIssue = async (issueNumber) => {
	try {
		const { owner } = github.context.payload.repository;
		const payload = {
			owner: owner.name ?? owner.login,
			repo: github.context.payload.repository.name,
			issue_number: issueNumber,
		};

		const content = await Promise.all([
			octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', payload),
		]);
		return content;
	} catch ({ message }) {
		throw new Error(`Failed to find Issue: ${message}`);
	}
};

const run = async () => {
	const { pr, base } = extractInputs();
	if (!pr) {
		throw new Error('PR number not provided');
	}

	const [merged, prData] = await getPR(pr);

	if (prData.data.node_id) {
		core.setOutput('pr-content-id', prData.data.node_id);
	} else {
		console.log(`${!prData.data.node_id ? '' : 'could not find PR issue node_id'}. No action needed`);
	}

	const match = prData.data.head.ref.match(/ISSUE_(\d+)/i);

	if (match.length > 1) {
		const issueNum = match[1];
		if (issueNum) {
			const [issueData] = await getIssue(issueNum);
			if (issueData.data.node_id) {
				core.setOutput('issue-content-id', issueData.data.node_id);
			} else {
				console.log(`${!issueData.data.node_id ? '' : 'could not find issue node_id'}. No action needed`);
			}
		}
		core.setOutput('issue-number', issueNum);
	} else {
		console.log(`could not extract issue number from ${prData.data.head.ref}`);
	}

	if (base) {
		if (merged && prData.data.base.ref === base) {
			core.setOutput('merged', merged);
		} else {
			core.setOutput('merged', false);
		}
	}
};
run().catch((err) => {
	core.setFailed(err.message);
});
