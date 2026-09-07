import fs from 'fs';

let code = fs.readFileSync('backend/dataFetcher.js', 'utf8');

code = code.replace(
`    }));
  } catch (err) {
    return null;
  }`,
`    }));
  } catch (err) {
    throw err;
  }`
);

fs.writeFileSync('backend/dataFetcher.js', code);
